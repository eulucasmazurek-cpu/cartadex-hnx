// Rastreio das remessas: manda o código para o comprador e acompanha as atualizações.
// Leitura automática pelo PacoteVício (RapidAPI, plano grátis de 1.000 consultas por mês).
import { db, cfg, setCfg, registrarAtividade, nomeContato } from './db.js'
import { destinoDe, primeiroNome } from './cobranca.js'
import { numCarta } from './leilao.js'

function coluna (nome, tipo) {
  if (!db.prepare('PRAGMA table_info(remessas)').all().some(c => c.name === nome)) db.exec(`ALTER TABLE remessas ADD COLUMN ${nome} ${tipo}`)
}
coluna('transportadora', 'TEXT')     // correios | totalexpress | anjun | outra (vazio = descobrir pelo código)
coluna('rastreio_avisado', 'INTEGER') // quando o código foi mandado ao comprador
coluna('rastreio_marco', 'TEXT')      // postado | transito | saiu | retirada | entregue | problema
coluna('rastreio_ultimo', 'TEXT')     // última movimentação
coluna('rastreio_local', 'TEXT')
coluna('rastreio_ultimo_em', 'INTEGER')
coluna('rastreio_conferido', 'INTEGER')
coluna('rastreio_n', 'INTEGER')       // quantas movimentações já vistas
coluna('rastreio_erro', 'TEXT')
coluna('rastreio_vazias', 'INTEGER')  // consultas seguidas sem nenhuma movimentação (código digitado errado?)

// Depois de tantas consultas seguidas sem nada, para de consultar sozinho (para não gastar o limite do mês).
export const MAX_VAZIAS = 8

export const TRANSPORTADORAS = { '': 'Automático', correios: 'Correios', totalexpress: 'Total Express', anjun: 'Anjun', outra: 'Outra (só o código)' }

export const MSG_CODIGO = `📦 Oi, {nome}! Sua encomenda foi enviada.

Código de rastreio: *{codigo}*
Acompanhe aqui: {link}

Qualquer dúvida é só responder esta mensagem.`

export const MSG_MOVIMENTO = `📦 Atualização da sua encomenda ({codigo}):
*{evento}*{local}

{link}`

export const MARCOS = {
  postado: 'Postado',
  transito: 'A caminho',
  saiu: 'Saiu para entrega',
  retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  problema: 'Precisa de atenção'
}

let _fetch = (...a) => fetch(...a)
export function _usarFetchRastreio (f) { _fetch = f }
let esperar = ms => new Promise(r => setTimeout(r, ms))
export function _semEsperaRastreio () { esperar = () => Promise.resolve() }

export const codigoLimpo = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export function transportadoraDe (codigo, escolhida = '') {
  if (escolhida && TRANSPORTADORAS[escolhida]) return escolhida
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(codigoLimpo(codigo)) ? 'correios' : 'outra'
}
export function linkRastreio (codigo) {
  const modelo = String(cfg('rastreio_link') || 'https://www.linkcorreios.com.br/?id={codigo}')
  return modelo.includes('{codigo}') ? modelo.replaceAll('{codigo}', codigoLimpo(codigo)) : modelo
}

// Em que pé está, pelo texto da movimentação.
export function classificar (texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/nao entregue|nao foi entregue|devolvid|remetente|devolucao|retorno ao|ausente|endereco (incorreto|insuficiente)|recusad|extraviad|roubad|nao procurado|aguardando pagamento|pagamento pendente|fiscaliza|tentativa de entrega/.test(t)) return 'problema'
  if (/entregue/.test(t)) return 'entregue'
  if (/saiu para entrega|em rota de entrega|out for delivery/.test(t)) return 'saiu'
  if (/retirada|retirar|disponivel (no|na|para)/.test(t)) return 'retirada'
  if (/postad|coletad|recebid[oa] (pel|n)/.test(t) && !/transferencia|transito/.test(t)) return 'postado'
  return 'transito'
}

// ---------- Consulta ----------
const ENDPOINT = { correios: '/correios', totalexpress: '/totalexpress', anjun: '/anjun' }

function quando (v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
  const s = String(v.date || v)
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/) || s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/)
  if (!m) { const d = Date.parse(s); return Number.isFinite(d) ? d : null }
  return m[1].length === 4 ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime()
}

// Cada transportadora responde num formato; aqui tudo vira [{ descricao, quando, local }] (mais nova primeiro).
export function normalizar (transportadora, j) {
  let ev = []
  if (transportadora === 'correios') {
    ev = (j.eventos || []).map(e => ({
      descricao: e.descricaoFrontEnd || e.descricaoWeb || e.descricao || '',
      quando: quando(e.dtHrCriado),
      local: [e.unidade?.endereco?.cidade, e.unidade?.endereco?.uf].filter(Boolean).join('/') || e.unidade?.nome || ''
    }))
  } else if (transportadora === 'anjun') {
    ev = (j.nodeDataList || []).map(e => ({ descricao: e.status || '', quando: quando(e.dateTime), local: e.address || '' }))
  } else if (transportadora === 'totalexpress') {
    const lista = []
    const andar = o => {
      if (Array.isArray(o)) return o.forEach(andar)
      if (o && typeof o === 'object') {
        if (o.statusDescricao) lista.push({ descricao: o.statusDescricao, quando: quando(`${o.data || ''} ${o.hora || ''}`.trim()), local: o.cidade || '' })
        Object.values(o).forEach(andar)
      }
    }
    andar(j.data || j)
    ev = lista
  }
  ev = ev.filter(e => e.descricao)
  if (ev.every(e => e.quando)) ev.sort((a, b) => b.quando - a.quando)
  return ev
}

const mesAtual = (agora = Date.now()) => new Date(agora).toISOString().slice(0, 7)
export function usoDoMes (agora = Date.now()) {
  const [mes, n] = String(cfg('rastreio_uso') || '').split(':')
  return mes === mesAtual(agora) ? Number(n) || 0 : 0
}
function contarUso (agora = Date.now()) { setCfg('rastreio_uso', `${mesAtual(agora)}:${usoDoMes(agora) + 1}`) }

export async function consultar (transportadora, codigo, agora = Date.now()) {
  const chave = String(cfg('rastreio_chave') || '').trim()
  if (!chave) throw new Error('falta a chave do PacoteVício (Configurações → Rastreio)')
  if (!ENDPOINT[transportadora]) throw new Error('essa transportadora não tem leitura automática')
  const limite = Number(cfg('rastreio_limite')) || 950
  if (usoDoMes(agora) >= limite) throw new Error(`limite de ${limite} consultas do mês atingido`)
  contarUso(agora)
  let r
  try {
    r = await _fetch(`https://api.pacotevicio.dev${ENDPOINT[transportadora]}?tracking_code=${encodeURIComponent(codigoLimpo(codigo))}&confidence_level=medium`, {
      headers: { 'X-RapidAPI-Key': chave },
      signal: AbortSignal.timeout(60_000)
    })
  } catch (e) {
    throw new Error(`sem resposta do serviço de rastreio (${e.name === 'TimeoutError' ? 'demorou demais' : e.message})`)
  }
  const texto = await r.text()
  if (r.status === 401 || r.status === 403) throw new Error('a chave do PacoteVício é inválida ou o plano não foi assinado no RapidAPI')
  if (r.status === 429) throw new Error('limite de consultas do PacoteVício atingido')
  if (r.status === 404) return []
  if (!r.ok) throw new Error(`serviço de rastreio respondeu ${r.status}`)
  let j = {}
  try { j = JSON.parse(texto.replace(/,\s*([}\]])/g, '$1')) } catch { throw new Error('resposta do rastreio não entendida') }
  return normalizar(transportadora, j)
}

// ---------- Mensagens ----------
function preencher (modelo, r, extra = {}) {
  const cartas = db.prepare('SELECT * FROM cartas WHERE remessa_id = ? ORDER BY id').all(r.id)
  const qual = cartas.length === 1 ? `a carta #${numCarta(cartas[0])}` : `${cartas.length} cartas`
  const nome = primeiroNome(r.comprador) || String(r.nome || '').trim().split(/\s+/)[0] || ''
  let t = String(modelo)
    .replaceAll('{nome}', nome).replaceAll('{codigo}', codigoLimpo(r.rastreio)).replaceAll('{link}', linkRastreio(r.rastreio))
    .replaceAll('{cartas}', qual).replaceAll('{evento}', extra.evento || '').replaceAll('{local}', extra.local ? ` · ${extra.local}` : '')
  if (!nome) t = t.replace(/,\s*([!.])/g, '$1')
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

function paraQuem (r) {
  // Telefone digitado na remessa tem preferência; senão, o do contato que ganhou.
  const tel = String(r.telefone || '').replace(/\D/g, '')
  if (tel.length >= 10) return (tel.length <= 11 ? '55' + tel : tel) + '@s.whatsapp.net'
  return destinoDe(r.comprador)
}

export async function mandarCodigo (wa, id) {
  const r = db.prepare('SELECT * FROM remessas WHERE id = ?').get(id)
  if (!r?.rastreio) throw new Error('a remessa não tem código de rastreio')
  if (!wa?.estado?.conectado) throw new Error('WhatsApp desconectado')
  await wa.enviarTexto(preencher(cfg('rastreio_msg') || MSG_CODIGO, r), [], paraQuem(r))
  db.prepare('UPDATE remessas SET rastreio_avisado = ? WHERE id = ?').run(Date.now(), id)
  console.log(`📦 Código ${codigoLimpo(r.rastreio)} enviado para ${nomeContato(r.comprador)}`)
  return true
}

// Chamado ao salvar a remessa: código novo → zera o acompanhamento, marca "Enviado" e (se ligado) avisa o comprador.
export async function codigoSalvo (wa, id, antes) {
  const r = db.prepare('SELECT * FROM remessas WHERE id = ?').get(id)
  if (!r) return { avisou: false }
  const novo = codigoLimpo(r.rastreio)
  if (!novo || novo === codigoLimpo(antes)) return { avisou: false }
  db.prepare(`UPDATE remessas SET rastreio = ?, rastreio_avisado = NULL, rastreio_marco = NULL, rastreio_ultimo = NULL, rastreio_local = NULL,
    rastreio_ultimo_em = NULL, rastreio_conferido = NULL, rastreio_n = 0, rastreio_erro = NULL, rastreio_vazias = 0 WHERE id = ?`).run(novo, id)
  if (['aguardando_pagamento', 'pago'].includes(r.status)) db.prepare("UPDATE remessas SET status = 'enviado' WHERE id = ?").run(id)
  if (cfg('rastreio_ativo') !== '1') return { avisou: false }
  try {
    await mandarCodigo(wa, id)
    return { avisou: true }
  } catch (e) {
    db.prepare('UPDATE remessas SET rastreio_erro = ? WHERE id = ?').run(`não consegui mandar o código: ${e.message}`.slice(0, 200), id)
    return { avisou: false, erro: e.message }
  }
}

// Confere uma remessa. Devolve { novas, marco, avisou }.
export async function conferir (wa, id, agora = Date.now()) {
  const r = db.prepare('SELECT * FROM remessas WHERE id = ?').get(id)
  if (!r?.rastreio) return { novas: 0 }
  const transp = transportadoraDe(r.rastreio, r.transportadora)
  db.prepare('UPDATE remessas SET rastreio_conferido = ? WHERE id = ?').run(agora, id)
  let ev
  try {
    ev = await consultar(transp, r.rastreio, agora)
  } catch (e) {
    db.prepare('UPDATE remessas SET rastreio_erro = ? WHERE id = ?').run(e.message.slice(0, 200), id)
    throw e
  }
  if (!ev.length && !(r.rastreio_n > 0)) {
    const vazias = (r.rastreio_vazias || 0) + 1
    const erro = vazias >= MAX_VAZIAS
      ? `Nenhuma movimentação depois de ${vazias} consultas: confira se o código está certo (parei de consultar sozinho; use "Conferir rastreio")`
      : null
    db.prepare('UPDATE remessas SET rastreio_vazias = ?, rastreio_erro = ? WHERE id = ?').run(vazias, erro, id)
    return { novas: 0, marco: r.rastreio_marco }
  }
  db.prepare('UPDATE remessas SET rastreio_erro = NULL, rastreio_vazias = 0 WHERE id = ?').run(id)
  if (!ev.length || ev.length <= (r.rastreio_n || 0)) return { novas: 0, marco: r.rastreio_marco }
  const ultimo = ev[0]
  const marco = classificar(ultimo.descricao)
  db.prepare('UPDATE remessas SET rastreio_n = ?, rastreio_ultimo = ?, rastreio_local = ?, rastreio_ultimo_em = ?, rastreio_marco = ? WHERE id = ?')
    .run(ev.length, ultimo.descricao.slice(0, 200), ultimo.local || null, ultimo.quando || agora, marco, id)
  if (marco === 'entregue') db.prepare("UPDATE remessas SET status = 'entregue' WHERE id = ?").run(id)
  else if (r.status !== 'enviado' && r.status !== 'entregue') db.prepare("UPDATE remessas SET status = 'enviado' WHERE id = ?").run(id)
  if (marco === 'problema') registrarAtividade('CartaDex', 'acao', `Rastreio ${codigoLimpo(r.rastreio)} (${nomeContato(r.comprador)}): ${ultimo.descricao}`.slice(0, 290))
  // Avisa o comprador quando muda de etapa (postado → a caminho → saiu → entregue...).
  let avisou = false
  const modo = cfg('rastreio_avisar') || 'marcos'
  const mudou = marco !== r.rastreio_marco
  if (modo !== 'nada' && (modo === 'tudo' || mudou) && wa?.estado?.conectado) {
    try {
      await wa.enviarTexto(preencher(cfg('rastreio_msg_mov') || MSG_MOVIMENTO, r, { evento: ultimo.descricao, local: ultimo.local }), [], paraQuem(r))
      avisou = true
    } catch (e) {
      console.error('Não consegui mandar a atualização do rastreio:', e.message)
    }
  }
  return { novas: ev.length - (r.rastreio_n || 0), marco, avisou }
}

// Remessas para conferir agora: com código, não entregues, de transportadora com leitura,
// enviadas há menos de 60 dias e conferidas há mais do intervalo escolhido.
export function paraConferir (agora = Date.now()) {
  const horas = Number(cfg('rastreio_horas')) || 6
  return db.prepare(`SELECT * FROM remessas WHERE rastreio IS NOT NULL AND rastreio != '' AND status != 'entregue'
    AND (rastreio_marco IS NULL OR rastreio_marco != 'entregue') AND criada_em > ?`).all(agora - 60 * 86400_000)
    .filter(r => ENDPOINT[transportadoraDe(r.rastreio, r.transportadora)])
    .filter(r => (r.rastreio_vazias || 0) < MAX_VAZIAS)
    .filter(r => !r.rastreio_conferido || agora - r.rastreio_conferido >= horas * 3600_000)
}

let rodando = false
export async function acompanharRastreios (wa, agora = Date.now()) {
  if (rodando || !String(cfg('rastreio_chave') || '').trim()) return 0
  rodando = true
  let n = 0
  try {
    for (const r of paraConferir(agora)) {
      try {
        const x = await conferir(wa, r.id, agora)
        if (x.novas) n++
      } catch (e) {
        console.error(`Rastreio ${r.rastreio}:`, e.message)
        if (/limite|chave/.test(e.message)) break
      }
      await esperar(2000)
    }
  } finally {
    rodando = false
  }
  return n
}
