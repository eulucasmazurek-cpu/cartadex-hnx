// Transforma os votos recebidos do WhatsApp em lances no banco.
// Fica separado da conexão para poder ser testado sem o WhatsApp.
import { createHash, createHmac, createDecipheriv } from 'node:crypto'
import { db } from './db.js'
import { registrarVoto, opcoesDaCarta } from './leilao.js'
import { cartaDaEnquete } from './grupos.js'

// O WhatsApp não manda o texto da opção votada, e sim o SHA-256 dele.
const sha256 = texto => createHash('sha256').update(Buffer.from(texto)).digest()

function paraNumero (v) {
  if (v === null || v === undefined) return NaN
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

// Normaliza "5511999999999:12@s.whatsapp.net" -> "5511999999999@s.whatsapp.net" (vale também para @lid)
export function normalizarJid (jid) {
  if (!jid || typeof jid !== 'string' || !jid.includes('@')) return ''
  const [usuario, servidor] = jid.split('@')
  return `${usuario.split(':')[0]}@${servidor}`
}

const RECEBE_VOTO = ['no_ar', 'fila']

const unicos = lista => [...new Set(lista.map(normalizarJid).filter(Boolean))]

// enqueteId: id da mensagem da enquete
// pollUpdates: [{ pollUpdateMessageKey, vote: { selectedOptions }, senderTimestampMs }]
// meuJid: jid do próprio bot (para votos feitos pelo número do bot)
export function processarVotos (enqueteId, pollUpdates, meuJid = '') {
  const carta = cartaDaEnquete(enqueteId)
  // "fila": a carta já saiu num grupo e ainda está indo para os outros; o voto já vale.
  if (!carta || !RECEBE_VOTO.includes(carta.status)) return 0

  const opcoes = carta.opcoes ? JSON.parse(carta.opcoes) : opcoesDaCarta(carta)
  const hashes = opcoes.map(o => sha256(o.texto))
  const lista = [...(pollUpdates || [])].sort((a, b) => paraNumero(a.senderTimestampMs) - paraNumero(b.senderTimestampMs))
  let contados = 0

  for (const pu of lista) {
    const k = pu.pollUpdateMessageKey || {}
    const votante = normalizarJid(k.fromMe ? meuJid : (k.participant || k.remoteJid))
    if (!votante) continue

    const marcadas = pu.vote?.selectedOptions || []
    const escolhidas = marcadas
      .map(h => hashes.findIndex(x => x.equals(Buffer.from(h))))
      .filter(i => i >= 0)
    // Marcou algo que não bate com nenhuma opção desta carta (enquete antiga, valores mudaram):
    // ignora em vez de tratar como "retirou o voto".
    if (marcadas.length && !escolhidas.length) continue
    const opcao = escolhidas.length ? escolhidas[0] : null

    let ts = paraNumero(pu.senderTimestampMs)
    if (!Number.isFinite(ts) || ts <= 0) ts = Date.now()
    // Voto feito depois da hora de encerrar não vale (mesmo que o encerramento atrase uns segundos).
    if (carta.status === 'no_ar' && carta.encerra_em && ts > carta.encerra_em && Date.now() > carta.encerra_em) continue

    registrarVoto(carta.id, votante, opcao, ts)
    contados++
  }
  return contados
}

// ---------- Decifrar o voto (mesmo esquema que o WhatsApp usa) ----------

// Lê o campo 1 (repetido, bytes) de um PollVoteMessage em protobuf.
function lerOpcoesProto (buf) {
  const opcoes = []
  let i = 0
  const varint = () => {
    let r = 0; let s = 0; let b
    do { b = buf[i++]; r += (b & 0x7f) * 2 ** s; s += 7 } while (b & 0x80)
    return r
  }
  while (i < buf.length) {
    const tag = varint()
    const campo = Math.floor(tag / 8); const tipo = tag & 7
    if (tipo === 2) {
      const n = varint()
      if (campo === 1) opcoes.push(buf.subarray(i, i + n))
      i += n
    } else if (tipo === 0) varint()
    else if (tipo === 1) i += 8
    else if (tipo === 5) i += 4
    else break
  }
  return opcoes
}

export function chaveVoto (segredo, enqueteId, criador, votante) {
  const assinatura = Buffer.concat([Buffer.from(enqueteId), Buffer.from(criador), Buffer.from(votante), Buffer.from('Poll Vote'), Buffer.from([1])])
  const k0 = createHmac('sha256', Buffer.alloc(32)).update(Buffer.from(segredo)).digest()
  return createHmac('sha256', k0).update(assinatura).digest()
}

export function decifrarVoto (voto, { segredo, enqueteId, criador, votante }) {
  const chave = chaveVoto(segredo, enqueteId, criador, votante)
  const dados = Buffer.from(voto.encPayload)
  const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(voto.encIv))
  d.setAAD(Buffer.from(`${enqueteId}\u0000${votante}`))
  d.setAuthTag(dados.subarray(-16))
  const claro = Buffer.concat([d.update(dados.subarray(0, -16)), d.final()])
  return { selectedOptions: lerOpcoesProto(claro) }
}

// Recebe a mensagem de voto "crua" (como chega em messages.upsert) e registra o lance.
// segredoDa(enqueteId) devolve a chave da enquete (messageSecret) guardada quando ela foi enviada.
// meusJids: todos os identificadores do bot (número e LID).
// Devolve { cartaId, ok, motivo }.
export function processarVotoBruto (msg, { segredoDa, meusJids = [], meuJid = '' }) {
  const pum = msg?.message?.pollUpdateMessage
  const criacao = pum?.pollCreationMessageKey
  if (!pum?.vote || !criacao?.id) return { ok: false, motivo: 'não é voto' }
  const carta = cartaDaEnquete(criacao.id)
  if (!carta) return { ok: false, motivo: 'enquete desconhecida' }
  if (!RECEBE_VOTO.includes(carta.status)) return { ok: false, cartaId: carta.id, motivo: 'carta já encerrada' }

  const segredo = segredoDa(criacao.id)
  if (!segredo) return { ok: false, cartaId: carta.id, motivo: 'chave da enquete não encontrada' }

  const k = msg.key || {}
  // Quem criou a enquete: o próprio bot, por número ou por LID.
  const criadores = unicos([...meusJids, criacao.participant, criacao.participantAlt, criacao.participantPn, criacao.participantLid])
  // Quem votou: o grupo pode identificar a pessoa pelo número ou pelo LID.
  const votantes = unicos([
    k.participant, k.participantAlt, k.participantPn, k.participantLid, k.senderPn, k.senderLid,
    ...(k.fromMe ? meusJids : []),
    k.remoteJid?.endsWith('@g.us') ? null : k.remoteJid
  ])

  for (const criador of criadores) {
    for (const votante of votantes) {
      let voto
      try {
        voto = decifrarVoto(pum.vote, { segredo, enqueteId: criacao.id, criador, votante })
      } catch { continue }
      let ts = paraNumero(pum.senderTimestampMs)
      if (!Number.isFinite(ts) || ts <= 0) ts = paraNumero(msg.messageTimestamp) * 1000
      processarVotos(criacao.id, [{ pollUpdateMessageKey: k, vote: voto, senderTimestampMs: ts }], meuJid)
      return { ok: true, cartaId: carta.id, opcoes: voto.selectedOptions.length }
    }
  }
  return { ok: false, cartaId: carta.id, motivo: `não consegui decifrar (${criadores.length}×${votantes.length} combinações)` }
}

export { sha256 }
