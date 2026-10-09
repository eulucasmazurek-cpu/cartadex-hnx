// Aviso no privado para quem ganhou: parabéns, foto de cada carta e o link de pagamento.
// Quem ganha várias cartas no mesmo encerramento recebe uma conversa só, com o total.
import path from 'node:path'
import { db, cfg, registrarAtividade, nomeContato, PASTA_FOTOS } from './db.js'
import { moeda, numCarta } from './leilao.js'
import { criarCobranca, preencher, linkFixo, destinoDe } from './cobranca.js'
import { montarMural, apagarDepois } from './mural.js'

export { destinoDe }

db.exec(`CREATE TABLE IF NOT EXISTS avisos_ganhador (
  carta_id INTEGER PRIMARY KEY,
  jid      TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  ok       INTEGER NOT NULL,     -- 1 = enviado; 0 = deu erro
  erro     TEXT
)`)

export const MENSAGEM_PADRAO = `🎉 Parabéns, {nome}! Você arrematou {cartas} no nosso leilão.

💰 Total: {total}
💳 Pague por aqui: {link}

Assim que o pagamento for confirmado, a gente combina o envio. Qualquer dúvida é só responder esta mensagem.`

let esperar = ms => new Promise(r => setTimeout(r, ms))
export function _semEspera () { esperar = () => Promise.resolve() }

// Uma coisa por vez: dois encerramentos seguidos não mandam mensagens ao mesmo tempo.
let corrente = Promise.resolve()
function emSerie (fn) {
  const p = corrente.then(fn, fn)
  corrente = p.catch(() => {})
  return p
}

const primeiraLinha = t => String(t || '').split('\n')[0].trim()

export function legendaCarta (c) {
  const desc = primeiraLinha(c.descricao)
  return `🏆 Carta #${numCarta(c)}${desc ? ` · ${desc}` : ''}\n${moeda(c.valor_venda)}`
}

export function textoGanhador (cartas, jid, modelo = cfg('ganhador_msg') || MENSAGEM_PADRAO, link = null) {
  const total = cartas.reduce((s, c) => s + (c.valor_venda || 0), 0)
  const final = link === null ? linkFixo(total) : String(link || '').trim().replaceAll('{valor}', (total / 100).toFixed(2))
  return preencher(modelo, cartas, jid, final)
}

export const avisoDaCarta = id => db.prepare('SELECT * FROM avisos_ganhador WHERE carta_id = ?').get(id)
export const avisosDasCartas = ids => Object.fromEntries(ids.map(id => [id, avisoDaCarta(id)]).filter(([, a]) => a))

function registrar (cartas, jid, ok, erro = null) {
  const st = db.prepare('INSERT OR REPLACE INTO avisos_ganhador (carta_id, jid, ts, ok, erro) VALUES (?, ?, ?, ?, ?)')
  for (const c of cartas) st.run(c.id, jid, Date.now(), ok ? 1 : 0, erro)
}

// Fotos das cartas: um mural com todas numa imagem só (padrão) ou uma foto por carta.
// Se o mural não der certo (sem ImageMagick, por exemplo), cai para uma foto por carta.
async function mandarFotos (wa, cartas, para) {
  let soltas = cartas
  if (cfg('ganhador_fotos') !== 'separadas' && cartas.filter(c => c.foto).length >= 2) {
    soltas = []
    for (let i = 0; i < cartas.length; i += 16) {
      const parte = cartas.slice(i, i + 16)
      const mural = await montarMural(parte)
      if (!mural) { soltas.push(...parte); continue }
      try {
        await wa.enviarFoto(mural, `🏆 Suas cartas: ${parte.map(c => '#' + numCarta(c)).join(', ')}`, para)
      } finally {
        apagarDepois(mural)
      }
      await esperar(2000 + Math.random() * 2000)
    }
  }
  for (const c of soltas) {
    if (!c.foto) continue
    try {
      await wa.enviarFoto(path.join(PASTA_FOTOS, c.foto), legendaCarta(c), para)
    } catch (e) {
      if (!/Foto não encontrada/.test(e.message)) throw e
    }
    await esperar(2000 + Math.random() * 2000)
  }
}

// Manda o aviso para um comprador (fotos + mensagem). Devolve true se deu certo.
async function avisarUm (wa, jid, cartas) {
  const para = destinoDe(jid)
  try {
    if (!wa?.estado?.conectado) throw new Error('WhatsApp desconectado')
    // Cobrança: link do Mercado Pago (se configurado) ou o link fixo. Cartas já pagas ficam de fora.
    const cob = await criarCobranca(jid, cartas, wa)
    if (!cob) { registrar(cartas, jid, true); return true }
    if (cob.cartas) cartas = cob.cartas
    await mandarFotos(wa, cartas, para)
    await wa.enviarTexto(textoGanhador(cartas, jid, undefined, cob.link || ''), [], para)
    registrar(cartas, jid, true)
    console.log(`📩 Aviso de vitória enviado para ${nomeContato(jid)} (${cartas.length} carta(s))`)
    return true
  } catch (e) {
    registrar(cartas, jid, false, e.message.slice(0, 200))
    registrarAtividade('CartaDex', 'acao', `Não consegui avisar ${nomeContato(jid)} que ganhou: ${e.message}`.slice(0, 290))
    console.error(`Não consegui avisar o ganhador ${nomeContato(jid)}:`, e.message)
    return false
  }
}

// Depois de encerrar: agrupa por ganhador e avisa quem ainda não foi avisado.
export function avisarGanhadores (wa, resultados) {
  if (cfg('ganhador_ativo') !== '1') return Promise.resolve({ enviados: 0, falhas: 0 })
  const porJid = new Map()
  for (const r of resultados) {
    if (!r.vencedor) continue
    if (avisoDaCarta(r.carta.id)?.ok) continue
    const c = db.prepare('SELECT * FROM cartas WHERE id = ?').get(r.carta.id)
    if (!c || c.status !== 'vendida') continue
    const jid = r.vencedor.votante
    if (!porJid.has(jid)) porJid.set(jid, [])
    porJid.get(jid).push(c)
  }
  return emSerie(async () => {
    let enviados = 0; let falhas = 0; let primeiro = true
    for (const [jid, cartas] of porJid) {
      if (!primeiro) await esperar(5000 + Math.random() * 5000) // pausa entre um ganhador e outro
      primeiro = false
      if (await avisarUm(wa, jid, cartas)) enviados++
      else falhas++
    }
    return { enviados, falhas }
  })
}

// Pelo painel (Vendas): manda de novo para um comprador, com todas as cartas dele ainda sem remessa.
export function avisarComprador (wa, jid) {
  const cartas = db.prepare("SELECT * FROM cartas WHERE status = 'vendida' AND remessa_id IS NULL AND remessa_apagada IS NULL AND vencedor = ? ORDER BY encerrada_em").all(jid)
  if (!cartas.length) return { total: 0, pronto: Promise.resolve(false) }
  return { total: cartas.length, pronto: emSerie(() => avisarUm(wa, jid, cartas)) }
}
