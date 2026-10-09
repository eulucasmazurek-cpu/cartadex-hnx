// Fila de envio, agendamentos, encerramentos e link da loja a cada hora.
import path from 'node:path'
import { db, cfg, setCfg, transacao, registrarAtividade, PASTA_FOTOS } from './db.js'
import { problemasDaCarta, encerrarCartas, textoResultado, moeda, numCarta, nomeLote, opcoesDaCarta } from './leilao.js'
import { gruposAtivos, alvosDaCarta, postagensDa, salvarPostagem, nomeGrupo, listarGruposDoBot, eventoDoHorario } from './grupos.js'
import { proximaVez, pegarDivulgacao } from './divulgacao.js'
import { verificarMembros } from './seguranca.js'
import { avisarGanhadores } from './ganhador.js'
import { cuidarDasCobrancas } from './cobranca.js'
import { acompanharRastreios } from './rastreio.js'

const esperar = ms => new Promise(r => setTimeout(r, ms))

// "wa" é a conexão com o WhatsApp: { estado, postarCarta, postarPrevia, apagarMensagem, enviarTexto } (sempre com o grupo).
// Fica injetada para os testes poderem usar um WhatsApp de mentira.
let wa = null

// Garante que só uma coisa é enviada por vez (o link da loja nunca cai
// entre a foto e a enquete de uma carta).
let corrente = Promise.resolve()
function emSerie (fn) {
  const p = corrente.then(fn, fn)
  corrente = p.catch(() => {})
  return p
}

// Coloca cartas para enviar. enviarEm vazio = agora. encerraEm vazio = encerrar manualmente.
// Serve tanto para o primeiro envio quanto para o reenvio das sem lance.
export function enfileirar (ids, { enviarEm = null, encerraEm = null, destino = null } = {}, agora = Date.now()) {
  const enviadas = []
  const recusadas = []
  if (encerraEm && encerraEm <= Math.max(agora, enviarEm || 0)) {
    return { enviadas, recusadas: ids.map(id => ({ id, problemas: ['o encerramento precisa ser depois do envio'] })) }
  }
  transacao(() => {
    for (const id of ids) {
      const c = db.prepare('SELECT * FROM cartas WHERE id = ?').get(id)
      if (!c) continue
      if (!['pendente', 'agendada', 'sem_lance'].includes(c.status)) {
        recusadas.push({ id, problemas: [`está como "${c.status}"`] })
        continue
      }
      const p = problemasDaCarta(c)
      if (p.length) { recusadas.push({ id, problemas: p }); continue }

      db.prepare('DELETE FROM votos WHERE carta_id = ?').run(id)
      db.prepare('DELETE FROM votos_retirados WHERE carta_id = ?').run(id)
      db.prepare('DELETE FROM postagens WHERE carta_id = ?').run(id)
      const agendar = enviarEm && enviarEm > agora
      db.prepare(`UPDATE cartas SET
          status = ?, enviar_em = ?, encerra_em = ?, na_fila_em = ?, destino = ?,
          vencedor = NULL, valor_venda = NULL, opcao_venda = NULL, encerrada_em = NULL,
          foto_msg_id = NULL, enquete_msg_id = NULL, grupo_jid = NULL, erro = NULL, opcoes = NULL
        WHERE id = ?`)
        .run(agendar ? 'agendada' : 'fila', enviarEm, encerraEm, agendar ? null : agora, destino, id)
      enviadas.push(id)
    }
  })
  return { enviadas, recusadas }
}

// Tira da fila/agendamento e volta para "pendente".
export function cancelarEnvio (ids) {
  const st = db.prepare("UPDATE cartas SET status = 'pendente', enviar_em = NULL, na_fila_em = NULL WHERE id = ? AND status IN ('fila','agendada')")
  let n = 0
  for (const id of ids) n += Number(st.run(id).changes)
  return n
}

// Próxima carta da fila que tem algum grupo ativo para receber.
// Cartas cujos grupos estão todos pausados esperam, sem travar as outras.
export function proximaDaFila () {
  const fila = db.prepare("SELECT * FROM cartas WHERE status = 'fila' ORDER BY na_fila_em, id").all()
  for (const c of fila) {
    const feitos = new Set(postagensDa(c.id).map(p => p.grupo_jid))
    const alvos = alvosDaCarta(c).filter(g => !feitos.has(g))
    if (alvos.length) return { ...c, alvos }
    if (!feitos.size) {
      const aviso = 'Esperando: os grupos escolhidos para esta carta estão pausados'
      if (c.erro !== aviso) db.prepare('UPDATE cartas SET erro = ? WHERE id = ?').run(aviso, c.id)
    } else {
      marcarNoAr(c) // já saiu em algum grupo e os que faltam foram pausados
    }
  }
  return undefined
}

const ehQueda = e => /desconectado|Connection Closed|Timed Out|Tempo esgotado/i.test(e.message)

// Se a fila atrasou e a carta entraria no ar com o encerramento já passado (ou quase),
// ela ganha um tempo mínimo de disputa, em vez de fechar sem ninguém ter visto.
export const TEMPO_MINIMO_NO_AR = 10 * 60_000
function marcarNoAr (c, agora = Date.now()) {
  const posts = postagensDa(c.id)
  if (!posts.length) return false
  const p0 = posts[0]
  let encerra = c.encerra_em
  let nota = c.erro_grupos || null
  if (encerra && encerra < agora + 2 * 60_000) {
    encerra = agora + TEMPO_MINIMO_NO_AR
    const hora = new Date(encerra).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    nota = [nota, `A fila atrasou e o encerramento já tinha passado: vai encerrar às ${hora}`].filter(Boolean).join('. ')
  }
  db.prepare(`UPDATE cartas SET status = 'no_ar', enviada_em = ?, envios = envios + 1, encerra_em = ?,
      foto_msg_id = ?, enquete_msg_id = ?, opcoes = ?, grupo_jid = ?, erro = ? WHERE id = ? AND status = 'fila'`)
    .run(agora, encerra ?? null, p0.foto_msg_id, p0.enquete_msg_id, JSON.stringify(opcoesDaCarta(c)), p0.grupo_jid, nota, c.id)
  return true
}

// Envia uma carta da fila para cada grupo de destino. Devolve true se enviou.
export async function enviarProxima () {
  const c = proximaDaFila()
  if (!c) return false
  const falhas = []; const avisos = []
  for (const [i, grupo] of c.alvos.entries()) {
    if (i) await esperar(2500 + Math.random() * 2500)
    try {
      const r = await emSerie(() => wa.postarCarta(c, grupo))
      salvarPostagem(c.id, grupo, r.fotoId, r.enqueteId)
    } catch (e) {
      console.error(`Erro ao enviar a carta #${numCarta(c)} (${nomeLote(c.lote_id)}) para ${nomeGrupo(grupo)}:`, e.message)
      // A enquete foi enviada mas o WhatsApp não confirmou a tempo: conta como postada
      // (mandar de novo duplicaria a enquete e dividiria os votos).
      if (e.incerto && e.enqueteId) {
        salvarPostagem(c.id, grupo, e.fotoId, e.enqueteId)
        avisos.push(`em ${nomeGrupo(grupo)} a enquete demorou para confirmar, confira se ela apareceu`)
        continue
      }
      // Desconexão: a carta continua na fila e tenta de novo depois (só nos grupos que faltam).
      if (ehQueda(e)) {
        db.prepare('UPDATE cartas SET erro = ? WHERE id = ?').run(`${e.message} (vou tentar de novo)`, c.id)
        throw e
      }
      falhas.push(`${nomeGrupo(grupo)}: ${e.message}`)
    }
  }
  const nota = [falhas.length ? `Não saiu em ${falhas.join('; ')}` : '', avisos.length ? `Atenção: ${avisos.join('; ')}` : ''].filter(Boolean).join('. ')
  if (marcarNoAr({ ...c, erro_grupos: nota || null })) return true
  db.prepare("UPDATE cartas SET status = 'pendente', erro = ? WHERE id = ?").run(falhas.join('; ') || 'Não foi possível enviar', c.id)
  return false
}

// Grupos onde cada carta foi postada (cartas antigas: o grupo gravado na própria carta).
function gruposDasCartas (cartas) {
  const mapa = new Map()
  for (const c of cartas) {
    const posts = postagensDa(c.id)
    const lista = posts.length ? posts : (c.grupo_jid ? [{ grupo_jid: c.grupo_jid, foto_msg_id: c.foto_msg_id, enquete_msg_id: c.enquete_msg_id }] : [])
    for (const p of lista) {
      if (!mapa.has(p.grupo_jid)) mapa.set(p.grupo_jid, [])
      mapa.get(p.grupo_jid).push({ carta: c, post: p })
    }
  }
  return mapa
}

// Resultado que não conseguiu sair (WhatsApp fora do ar ou erro no envio) fica guardado
// e sai assim que a conexão voltar (até 12 horas depois).
db.exec(`CREATE TABLE IF NOT EXISTS anuncios_pendentes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo      TEXT NOT NULL,
  cartas     TEXT NOT NULL,          -- JSON com os ids das cartas
  anunciar   INTEGER NOT NULL,       -- 1 = mandar o resultado no grupo
  limpar     INTEGER NOT NULL,       -- 1 = apagar enquetes/fotos (se configurado)
  criado     INTEGER NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0
)`)
const PRAZO_ANUNCIO = 12 * 3600_000

function guardarAnuncio (grupo, cartaIds, { anunciar, limpar }, agora = Date.now()) {
  if (!anunciar && !limpar) return
  db.prepare('INSERT INTO anuncios_pendentes (grupo, cartas, anunciar, limpar, criado) VALUES (?, ?, ?, ?, ?)')
    .run(grupo, JSON.stringify(cartaIds), anunciar ? 1 : 0, limpar ? 1 : 0, agora)
}

export async function encerrarEAnunciar (ids) {
  const resultados = encerrarCartas(ids)
  if (!resultados.length) return resultados
  const porGrupo = gruposDasCartas(resultados.map(r => r.carta))
  const anunciar = cfg('anunciar_resultado') === '1'
  const limpar = cfg('apagar_enquete') === '1' || cfg('apagar_foto') === '1'
  if (!wa?.estado.conectado) {
    // Sem conexão agora: tudo fica para quando o WhatsApp voltar.
    for (const [grupo, itens] of porGrupo) guardarAnuncio(grupo, itens.map(i => i.carta.id), { anunciar, limpar })
  } else {
    if (anunciar) {
      // Cada grupo recebe o resultado só das cartas que foram postadas nele.
      for (const [grupo, itens] of porGrupo) {
        const ids = new Set(itens.map(i => i.carta.id))
        const { texto, mencoes } = textoResultado(resultados.filter(r => ids.has(r.carta.id)))
        try {
          await emSerie(() => wa.enviarTexto(texto, mencoes, grupo))
        } catch (e) {
          console.error(`Não consegui anunciar o resultado em ${nomeGrupo(grupo)} (vou tentar de novo):`, e.message)
          guardarAnuncio(grupo, [...ids], { anunciar: true, limpar: false })
        }
      }
    }
    await limparGrupos(porGrupo)
  }
  // Aviso no privado para quem ganhou (em segundo plano, com pausas entre um e outro).
  avisarGanhadores(wa, resultados).catch(e => console.error('Erro ao avisar ganhadores:', e.message))
  return resultados
}

// Monta de novo o resultado a partir do banco (para os anúncios que ficaram pendentes).
function resultadoSalvo (c) {
  return {
    carta: c,
    vencedor: c.status === 'vendida' && c.vencedor
      ? { votante: c.vencedor, valor: c.valor_venda, tipo: c.opcao_venda === 3 ? 'arremate' : 'lance', opcao: c.opcao_venda }
      : null
  }
}

export async function anunciarPendentes (agora = Date.now()) {
  if (!wa?.estado.conectado) return 0
  db.prepare('DELETE FROM anuncios_pendentes WHERE criado < ? OR tentativas >= 5').run(agora - PRAZO_ANUNCIO)
  const pend = db.prepare('SELECT * FROM anuncios_pendentes ORDER BY id').all()
  let n = 0
  for (const a of pend) {
    if (!wa.estado.conectado) break
    const cartas = JSON.parse(a.cartas).map(id => db.prepare("SELECT * FROM cartas WHERE id = ? AND status IN ('vendida','sem_lance')").get(id)).filter(Boolean)
    if (!cartas.length) { db.prepare('DELETE FROM anuncios_pendentes WHERE id = ?').run(a.id); continue }
    try {
      if (a.anunciar && cfg('anunciar_resultado') === '1') {
        const { texto, mencoes } = textoResultado(cartas.map(resultadoSalvo))
        await emSerie(() => wa.enviarTexto(texto, mencoes, a.grupo))
      }
      db.prepare('DELETE FROM anuncios_pendentes WHERE id = ?').run(a.id)
      n++
    } catch (e) {
      db.prepare('UPDATE anuncios_pendentes SET tentativas = tentativas + 1 WHERE id = ?').run(a.id)
      console.error(`Ainda não consegui anunciar o resultado em ${nomeGrupo(a.grupo)}:`, e.message)
      continue
    }
    if (a.limpar) {
      const porGrupo = new Map([[a.grupo, cartas.map(c => ({ carta: c, post: postagensDa(c.id).find(p => p.grupo_jid === a.grupo) || { grupo_jid: c.grupo_jid, foto_msg_id: c.foto_msg_id, enquete_msg_id: c.enquete_msg_id } }))]])
      await limparGrupos(porGrupo)
    }
  }
  return n
}

// Apaga dos grupos as enquetes (e, se configurado, as fotos) das cartas encerradas.
async function limparGrupos (porGrupo) {
  const enquete = cfg('apagar_enquete') === '1'
  const foto = cfg('apagar_foto') === '1'
  if ((!enquete && !foto) || !wa?.estado.conectado || !wa.apagarMensagem) return 0
  const apagar = []
  for (const [grupo, itens] of porGrupo) {
    for (const { carta, post } of itens) {
      if (enquete && post.enquete_msg_id) apagar.push([grupo, post.enquete_msg_id, carta])
      if (foto && post.foto_msg_id) apagar.push([grupo, post.foto_msg_id, carta])
    }
  }
  let n = 0
  await emSerie(async () => {
    for (const [grupo, id, carta] of apagar) {
      try {
        await wa.apagarMensagem(grupo, id)
        n++
      } catch (e) {
        console.error(`Não consegui apagar a mensagem da carta #${numCarta(carta)} em ${nomeGrupo(grupo)}:`, e.message)
      }
      await esperar(700)
    }
  })
  return n
}

// Prévia: posta as fotos sem enquete, depois de uma mensagem de abertura.
// Roda em segundo plano; devolve quantas cartas vão sair.
export function legendaPrevia (c, comValores) {
  const lote = nomeLote(c.lote_id)
  const linhas = [`🔜 *${lote ? `${lote}, carta` : 'Carta'} #${numCarta(c)}*`]
  const desc = String(c.descricao || '').trim()
  if (desc) linhas.push(desc)
  if (comValores) {
    const lances = [c.v1, c.v2, c.v3].filter(Boolean)
    if (lances.length) linhas.push('', `Lances a partir de ${moeda(Math.min(...lances))}`)
    if (c.arremate) linhas.push(`⚡ Arremate: ${moeda(c.arremate)}`)
  }
  return linhas.join('\n')
}

export function textoPrevia (modelo, n, quando) {
  let t = String(modelo || '{n} cartas entram em disputa {quando}.')
  t = quando ? t.replaceAll('{quando}', quando) : t.replaceAll(' {quando}', '').replaceAll('{quando}', '')
  return t.replaceAll('{n}', String(n))
}

export function enviarPrevia (ids, { texto = '', comValores = true, grupos = null } = {}) {
  const cartas = ids.map(id => db.prepare('SELECT * FROM cartas WHERE id = ?').get(id)).filter(Boolean)
  const destinos = grupos || gruposAtivos().map(g => g.jid)
  if (!cartas.length || !destinos.length) return { total: 0, grupos: 0, pronto: Promise.resolve(0) }
  const pronto = (async () => {
    let n = 0
    for (const grupo of destinos) {
      await emSerie(async () => {
        try {
          if (texto.trim()) await wa.enviarTexto(texto.trim(), [], grupo)
        } catch (e) { console.error(`Erro no texto da prévia em ${nomeGrupo(grupo)}:`, e.message) }
        for (const c of cartas) {
          await esperar(1500 + Math.random() * 1500)
          try {
            await wa.postarPrevia(c, legendaPrevia(c, comValores), grupo)
            db.prepare('UPDATE cartas SET previa_em = ? WHERE id = ?').run(Date.now(), c.id)
            n++
          } catch (e) {
            console.error(`Erro na prévia da carta #${numCarta(c)} em ${nomeGrupo(grupo)}:`, e.message)
          }
        }
      })
      console.log(`👀 Prévia enviada em ${nomeGrupo(grupo)}`)
    }
    return n
  })().catch(e => { console.error('Erro ao enviar prévia:', e.message); return 0 })
  return { total: cartas.length, grupos: destinos.length, pronto }
}

// Envia o link da loja no início de cada hora, dentro do horário configurado.
export async function talvezEnviarLink (agora = new Date()) {
  if (cfg('link_ativo') !== '1' || !cfg('link_url') || !wa?.estado.conectado) return false
  const h = agora.getHours()
  const ini = Number(cfg('link_hora_inicio'))
  const fim = Number(cfg('link_hora_fim'))
  if (h < ini || h >= fim) return false

  const marca = `${agora.getFullYear()}-${agora.getMonth() + 1}-${agora.getDate()} ${h}`
  if (cfg('link_ultimo') === marca) return false
  setCfg('link_ultimo', marca)

  const texto = (cfg('link_texto') || '{link}').replaceAll('{link}', cfg('link_url'))
  let enviou = false
  for (const g of gruposAtivos()) {
    try {
      await emSerie(() => wa.enviarTexto(texto, [], g.jid))
      enviou = true
    } catch (e) {
      console.error(`Erro ao enviar link da loja em ${g.nome || g.jid}:`, e.message)
    }
  }
  return enviou
}

// ---------- Fechar e abrir grupos (só administradores mandam mensagem) ----------
const textoHorario = tipo => String(cfg(tipo === 'fechar' ? 'horario_msg_fechar' : 'horario_msg_abrir') || '')
  .replaceAll('{abre}', cfg('horario_abrir')).replaceAll('{fecha}', cfg('horario_fechar')).trim()

// estados: { jid: { fechado, souAdmin } } vindos do WhatsApp (se souber, pula o que já está certo).
export async function mudarGrupos (jids, fechar, { estados = {}, avisar = false } = {}) {
  const feitos = []; const falhas = []; const repetir = []
  for (const jid of jids) {
    const e = estados[jid]
    if (e && e.fechado === fechar) continue
    if (e && !e.souAdmin) { falhas.push(`${nomeGrupo(jid)}: o bot não é administrador`); continue }
    try {
      await emSerie(async () => {
        await wa.fecharGrupo(jid, fechar)
        const t = avisar ? textoHorario(fechar ? 'fechar' : 'abrir') : ''
        if (t) { await esperar(800); await wa.enviarTexto(t, [], jid) }
      })
      feitos.push(jid)
    } catch (err) {
      falhas.push(`${nomeGrupo(jid)}: ${err.message}`)
      repetir.push(jid)
    }
    await esperar(1000)
  }
  return { feitos, falhas, repetir }
}

// Aplica o horário automático (uma vez por "fechar" ou "abrir"; mudança manual depois disso é respeitada).
export async function aplicarHorarioGrupos (agora = Date.now()) {
  if (cfg('horario_ativo') !== '1' || !wa?.estado.conectado || !wa.fecharGrupo) return null
  const ev = eventoDoHorario(agora, cfg('horario_fechar'), cfg('horario_abrir'))
  if (!ev) return null
  const marca = `${ev.tipo}@${ev.quando}`
  // Grupos que falharam (queda, erro do WhatsApp) são tentados de novo, até 5 vezes.
  let pend = null
  try { pend = JSON.parse(cfg('horario_pendente') || 'null') } catch {}
  let jids
  if (cfg('horario_marca') === marca) {
    if (!pend || pend.marca !== marca || !pend.jids?.length || pend.tentativas >= 5) return null
    jids = pend.jids
  } else {
    jids = listarGruposDoBot().map(g => g.jid)
    pend = { marca, jids: [], tentativas: 0 }
  }
  setCfg('horario_marca', marca)
  if (!jids.length) { setCfg('horario_pendente', ''); return null }
  let estados = {}
  try { estados = Object.fromEntries((await wa.listarGrupos()).map(g => [g.id, g])) } catch {}
  const r = await mudarGrupos(jids, ev.tipo === 'fechar', { estados, avisar: true })
  setCfg('horario_pendente', r.repetir.length ? JSON.stringify({ marca, jids: r.repetir, tentativas: pend.tentativas + 1 }) : '')
  const verbo = ev.tipo === 'fechar' ? 'Fechou' : 'Abriu'
  if (r.feitos.length) {
    console.log(`${ev.tipo === 'fechar' ? '🔒' : '🔓'} Horário automático: ${verbo.toLowerCase()} ${r.feitos.length} grupo(s)`)
    registrarAtividade('CartaDex', 'acao', `${verbo} ${r.feitos.length} grupo(s) pelo horário automático`)
  }
  if (r.falhas.length) {
    console.error('Horário automático:', r.falhas.join('; '))
    registrarAtividade('CartaDex', 'acao', `Horário automático não conseguiu: ${r.falhas.join('; ')}`.slice(0, 290))
  }
  return r
}

// ---------- Divulgação ----------
const enviandoAgora = new Set()

async function enviarUmaDivulgacao (d) {
  const alvos = alvosDaCarta(d)
  if (!alvos.length) return { ok: 0, falhas: ['nenhum grupo ativo para receber'], queda: false }
  let ok = 0; const falhas = []
  for (const [i, grupo] of alvos.entries()) {
    if (i) await esperar(2000 + Math.random() * 2000)
    try {
      await emSerie(() => d.foto
        ? wa.enviarFoto(path.join(PASTA_FOTOS, d.foto), d.texto, grupo)
        : wa.enviarTexto(d.texto, [], grupo))
      ok++
    } catch (e) {
      if (ehQueda(e)) return { ok, falhas: [e.message], queda: true }
      falhas.push(`${nomeGrupo(grupo)}: ${e.message}`)
    }
  }
  return { ok, falhas, queda: false }
}

function guardarResultado (d, r, { manual = false, agora = Date.now() } = {}) {
  const erro = r.falhas.length ? r.falhas.join('; ').slice(0, 400) : null
  const ultimo = r.ok ? Date.now() : d.ultimo_envio
  if (r.queda && !manual) {
    db.prepare("UPDATE divulgacoes SET status = 'agendada', erro = ? WHERE id = ?").run(`${erro} (vou tentar de novo)`, d.id)
    return
  }
  if (d.repetir) {
    // Envio manual de uma que repete não muda a agenda dela.
    const proximo = manual ? d.proximo_em : proximaVez(d.proximo_em || agora, d.repetir, agora)
    db.prepare("UPDATE divulgacoes SET status = 'agendada', proximo_em = ?, envios = envios + ?, ultimo_envio = ?, erro = ? WHERE id = ?")
      .run(proximo, r.ok ? 1 : 0, ultimo, erro, d.id)
    return
  }
  db.prepare("UPDATE divulgacoes SET status = ?, proximo_em = NULL, envios = envios + ?, ultimo_envio = ?, erro = ? WHERE id = ?")
    .run(r.ok ? 'enviada' : 'erro', r.ok ? 1 : 0, ultimo, erro, d.id)
}

// Envia as divulgações que chegaram na hora.
export async function enviarDivulgacoes (agora = Date.now()) {
  if (!wa?.estado.conectado) return 0
  const prontas = db.prepare("SELECT * FROM divulgacoes WHERE status = 'agendada' AND proximo_em <= ? ORDER BY proximo_em, id").all(agora)
  let n = 0
  for (const d of prontas) {
    // Reserva antes de enviar, para nunca sair duas vezes.
    if (!Number(db.prepare("UPDATE divulgacoes SET status = 'enviando' WHERE id = ? AND status = 'agendada'").run(d.id).changes)) continue
    const r = await enviarUmaDivulgacao(d)
    guardarResultado(d, r, { agora })
    if (r.ok) console.log(`📣 Divulgação #${d.id} enviada para ${r.ok} grupo(s)`)
    n++
  }
  return n
}

// "Enviar agora" do painel (também serve para tentar de novo uma que deu erro).
export async function enviarDivulgacaoAgora (id) {
  const d = pegarDivulgacao(id)
  if (!d || d.status === 'enviando' || enviandoAgora.has(d.id)) return null
  // Reserva (também as que repetem), para o agendador não mandar a mesma ao mesmo tempo.
  if (!Number(db.prepare("UPDATE divulgacoes SET status = 'enviando' WHERE id = ? AND status <> 'enviando'").run(d.id).changes)) return null
  enviandoAgora.add(d.id)
  try {
    const r = await enviarUmaDivulgacao(d)
    if (r.queda && !d.repetir) {
      db.prepare("UPDATE divulgacoes SET status = 'erro', erro = ? WHERE id = ?").run(r.falhas.join('; '), d.id)
      return r
    }
    guardarResultado(d, r, { manual: true })
    return r
  } finally {
    enviandoAgora.delete(d.id)
  }
}

// Uma volta do agendador: libera agendadas, encerra vencidas, manda o link.
export async function verificarAgenda (agora = Date.now()) {
  db.prepare("UPDATE cartas SET status = 'fila', na_fila_em = enviar_em WHERE status = 'agendada' AND enviar_em <= ?").run(agora)

  const vencidas = db.prepare("SELECT id FROM cartas WHERE status = 'no_ar' AND encerra_em IS NOT NULL AND encerra_em <= ?")
    .all(agora).map(r => r.id)
  if (vencidas.length) await encerrarEAnunciar(vencidas)
  await anunciarPendentes(agora)

  await talvezEnviarLink(new Date(agora))
  await enviarDivulgacoes(agora)
  await aplicarHorarioGrupos(agora)
  // Pagamentos e lembretes de cobrança (em segundo plano: os lembretes têm pausas entre um e outro).
  if (wa) cuidarDasCobrancas(wa, agora).catch(e => console.error('Erro nas cobranças:', e.message))
  // Rastreio das remessas (cada uma no intervalo escolhido).
  if (wa) acompanharRastreios(wa, agora).catch(e => console.error('Erro no rastreio:', e.message))
  // Verificação de membros uma vez por dia.
  if (wa?.estado.conectado && wa.membrosDoGrupo && agora - (Number(cfg('seguranca_ultima')) || 0) > 24 * 3600_000) {
    const grupos = listarGruposDoBot()
    if (grupos.length) await verificarMembros(wa, grupos, agora).catch(e => console.error('Erro na verificação de membros:', e.message))
  }
}

// Divulgação que estava "enviando" quando o bot desligou ficaria presa para sempre.
export function destravarDivulgacoes (agora = Date.now()) {
  const presas = db.prepare("SELECT * FROM divulgacoes WHERE status = 'enviando'").all()
  for (const d of presas) {
    if (d.repetir) {
      const proximo = d.proximo_em > agora ? d.proximo_em : proximaVez(d.proximo_em || agora, d.repetir, agora)
      db.prepare("UPDATE divulgacoes SET status = 'agendada', proximo_em = ? WHERE id = ?").run(proximo, d.id)
    } else {
      db.prepare("UPDATE divulgacoes SET status = 'erro', erro = ? WHERE id = ?")
        .run('O bot reiniciou no meio do envio: confira nos grupos e use "Enviar agora" se faltou algum', d.id)
    }
  }
  return presas.length
}

export function iniciarFila (conexao) {
  wa = conexao
  destravarDivulgacoes()

  // Agendador: a cada 20 segundos (sem rodar duas voltas ao mesmo tempo).
  let verificando = false
  setInterval(() => {
    if (verificando) return
    verificando = true
    verificarAgenda().catch(e => console.error('Erro no agendador:', e)).finally(() => { verificando = false })
  }, 20_000)

  // Trabalhador da fila: posta uma carta, espera o intervalo, posta a próxima.
  ;(async () => {
    for (;;) {
      try {
        if (wa.estado.conectado && gruposAtivos().length && cfg('fila_pausada') !== '1') {
          if (await enviarProxima()) {
            const min = Number(cfg('intervalo_min')) || 8
            const max = Math.max(min, Number(cfg('intervalo_max')) || 15)
            await esperar((min + Math.random() * (max - min)) * 1000)
            continue
          }
        }
      } catch {
        await esperar(30_000)
      }
      await esperar(3000)
    }
  })()
}

// Só para testes.
export function _usarConexao (conexao) { wa = conexao }
