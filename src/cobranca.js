// Cobranças: o link de pagamento de cada ganhador, a conferência automática do pagamento
// (Mercado Pago) e os lembretes para quem ainda não pagou.
import { randomBytes } from 'node:crypto'
import { db, cfg, setCfg, registrarAtividade, nomeContato } from './db.js'
import { moeda, numCarta } from './leilao.js'
import { temMP, criarLinkMP, pagamentoAprovado, expirarLinkMP } from './mercadopago.js'

db.exec(`CREATE TABLE IF NOT EXISTS cobrancas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  jid             TEXT NOT NULL,
  total           INTEGER NOT NULL,          -- centavos
  criada_em       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente',   -- pendente | pago | cancelada
  link            TEXT,
  mp_pref         TEXT,                      -- id do link no Mercado Pago (vazio = link fixo)
  pago_em         INTEGER,
  pago_por        TEXT,
  lembretes       INTEGER NOT NULL DEFAULT 0,
  ultimo_lembrete INTEGER
);
CREATE TABLE IF NOT EXISTS cobranca_cartas (
  cobranca_id INTEGER NOT NULL,
  carta_id    INTEGER NOT NULL,
  PRIMARY KEY (cobranca_id, carta_id)
);`)
// Cobrança paga "excluída" só some da tela: continua valendo como pagamento (para as cartas não voltarem a ser cobradas).
try { db.exec('ALTER TABLE cobrancas ADD COLUMN oculta INTEGER') } catch {}
// Referência única no Mercado Pago (cobranças novas). Sem ela, depois de restaurar um backup
// uma cobrança nova podia ganhar o mesmo número de uma antiga e "achar" o pagamento dela.
try { db.exec('ALTER TABLE cobrancas ADD COLUMN ref TEXT') } catch {}
try { db.exec('ALTER TABLE cobrancas ADD COLUMN cancelada_em INTEGER') } catch {}

// Carta paga = está numa cobrança paga. Usado no "A receber".
export const SQL_A_RECEBER = `SELECT COALESCE(SUM(c.valor_venda), 0) v FROM cartas c LEFT JOIN remessas r ON r.id = c.remessa_id
  WHERE c.status = 'vendida'
    AND ((c.remessa_id IS NULL AND c.remessa_apagada IS NULL) OR r.status = 'aguardando_pagamento')
    AND NOT EXISTS (SELECT 1 FROM cobranca_cartas cc JOIN cobrancas b ON b.id = cc.cobranca_id WHERE cc.carta_id = c.id AND b.status = 'pago')`
export const cartaPaga = id => Boolean(db.prepare(`SELECT 1 FROM cobranca_cartas cc JOIN cobrancas b ON b.id = cc.cobranca_id
  WHERE cc.carta_id = ? AND b.status = 'pago'`).get(id))

export const LEMBRETE_PADRAO = `⏰ Oi, {nome}! Passando para lembrar do pagamento de {cartas}.

💰 Total: {total}
💳 Pague por aqui: {link}

Se você já pagou, pode desconsiderar esta mensagem.`

export const PAGO_PADRAO = `✅ Pagamento recebido, {nome}! Obrigado.
Logo a gente combina o envio de {cartas}.`

let esperar = ms => new Promise(r => setTimeout(r, ms))
export function _semEsperaCobranca () { esperar = () => Promise.resolve() }

// ---------- Textos ----------
export function primeiroNome (jid) {
  const nome = db.prepare('SELECT nome FROM contatos WHERE jid = ?').get(jid)?.nome
  return String(nome || '').trim().split(/\s+/)[0] || ''
}

// Para onde mandar: o número de telefone, quando o bot conhece; senão, o próprio identificador do WhatsApp.
export function destinoDe (jid) {
  const tel = String(db.prepare('SELECT telefone FROM contatos WHERE jid = ?').get(jid)?.telefone || '').replace(/\D/g, '')
  if (tel.length >= 10) return tel + '@s.whatsapp.net'
  return jid
}

export function linkFixo (total) {
  return String(cfg('ganhador_link') || '').trim().replaceAll('{valor}', (total / 100).toFixed(2))
}

// Troca {nome}, {cartas}, {total} e {link}. Sem link, some a linha do {link}.
export function preencher (modelo, cartas, jid, link) {
  const total = cartas.reduce((s, c) => s + (c.valor_venda || 0), 0)
  const nome = primeiroNome(jid)
  const qual = cartas.length === 1 ? `a carta #${numCarta(cartas[0])}` : `${cartas.length} cartas (${cartas.map(c => '#' + numCarta(c)).join(', ')})`
  let t = String(modelo || '')
  link = String(link || '').trim()
  if (!link) t = t.split('\n').filter(l => !l.includes('{link}')).join('\n')
  t = t.replaceAll('{nome}', nome).replaceAll('{cartas}', qual).replaceAll('{total}', moeda(total)).replaceAll('{link}', link)
  if (!nome) t = t.replace(/,\s*([!.])/g, '$1').replace(/ ,/g, ',')
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

// ---------- Consultas ----------
export const pegarCobranca = id => db.prepare('SELECT * FROM cobrancas WHERE id = ?').get(id)
export const cartasDaCobranca = id => db.prepare(`SELECT c.* FROM cobranca_cartas cc JOIN cartas c ON c.id = cc.carta_id
  WHERE cc.cobranca_id = ? ORDER BY c.encerrada_em, c.id`).all(id)
export const cobrancaDaCarta = id => db.prepare(`SELECT b.* FROM cobranca_cartas cc JOIN cobrancas b ON b.id = cc.cobranca_id
  WHERE cc.carta_id = ? AND b.status != 'cancelada' ORDER BY b.id DESC`).get(id)
export const cobrancasPendentes = () => db.prepare("SELECT * FROM cobrancas WHERE status = 'pendente' ORDER BY criada_em").all()
export const contarPendentes = () => db.prepare("SELECT COUNT(*) n FROM cobrancas WHERE status = 'pendente'").get().n
export const pagasRecentes = (n = 15) => db.prepare("SELECT * FROM cobrancas WHERE status = 'pago' AND oculta IS NULL ORDER BY pago_em DESC LIMIT ?").all(n)
const referencia = b => b.ref || `cartadex-${b.id}`

// O pagamento encontrado é mesmo desta cobrança? Valor tem que bater e não pode ser de antes dela existir.
export function pagamentoConfere (p, b) {
  if (!p) return false
  const valor = Math.round(Number(p.transaction_amount) * 100)
  if (Number.isFinite(valor) && valor > 0 && valor + 1 < b.total) return false
  const quando = Date.parse(p.date_created || p.date_approved || '')
  if (Number.isFinite(quando) && quando < b.criada_em - 10 * 60_000) return false
  return true
}

async function pagamentoDa (b) {
  return pagamentoAprovado(referencia(b), p => pagamentoConfere(p, b))
}

// Link que não vale mais (substituído ou parado): pede ao Mercado Pago para expirar. Se não der, tudo bem:
// a conferência dos pagamentos também olha os links cancelados dos últimos dias.
async function expirar (b) {
  if (!b?.mp_pref || !temMP()) return
  try { await expirarLinkMP(b.mp_pref) } catch (e) { console.error(`Mercado Pago (expirar link da cobrança ${b.id}):`, e.message) }
}

// ---------- Criar ----------
// Cria (ou reaproveita) a cobrança das cartas de um ganhador e devolve { id, link }.
// Cartas já pagas ficam de fora; cobranças antigas dessas cartas que não foram pagas são substituídas.
export async function criarCobranca (jid, cartas, wa = null) {
  const ids = cartas.map(c => c.id).sort((a, b) => a - b)
  const abertas = db.prepare(`SELECT DISTINCT b.* FROM cobrancas b JOIN cobranca_cartas cc ON cc.cobranca_id = b.id
    WHERE b.status = 'pendente' AND cc.carta_id IN (${ids.map(() => '?').join(',') || 'NULL'})`).all(...ids)
  // A mesma cobrança, com as mesmas cartas: reaproveita o link.
  for (const b of abertas) {
    const delas = cartasDaCobranca(b.id).map(c => c.id).sort((a, b) => a - b)
    if (delas.join() === ids.join()) return { id: b.id, link: b.link }
  }
  for (const b of abertas) {
    // Antes de substituir, confere se essa já não foi paga.
    if (b.mp_pref && temMP()) {
      try {
        const p = await pagamentoDa(b)
        if (p) { await marcarPago(b.id, 'Mercado Pago', { wa, pagamento: p }); continue }
      } catch {}
    }
    db.prepare("UPDATE cobrancas SET status = 'cancelada', pago_por = 'substituída por outra', cancelada_em = ? WHERE id = ?").run(Date.now(), b.id)
    await expirar(b)
  }
  const restantes = cartas.filter(c => !db.prepare(`SELECT 1 FROM cobranca_cartas cc JOIN cobrancas b ON b.id = cc.cobranca_id
    WHERE cc.carta_id = ? AND b.status = 'pago'`).get(c.id))
  if (!restantes.length) return null
  const total = restantes.reduce((s, c) => s + (c.valor_venda || 0), 0)
  const id = Number(db.prepare('INSERT INTO cobrancas (jid, total, criada_em) VALUES (?, ?, ?)').run(jid, total, Date.now()).lastInsertRowid)
  const ref = `cartadex-${id}-${randomBytes(4).toString('hex')}`
  db.prepare('UPDATE cobrancas SET ref = ? WHERE id = ?').run(ref, id)
  for (const c of restantes) db.prepare('INSERT INTO cobranca_cartas (cobranca_id, carta_id) VALUES (?, ?)').run(id, c.id)
  let link = linkFixo(total); let pref = null
  if (temMP()) {
    try {
      const r = await criarLinkMP({ referencia: ref, cartas: restantes })
      link = r.link; pref = r.id
    } catch (e) {
      registrarAtividade('CartaDex', 'acao', `Mercado Pago: não consegui criar o link de ${nomeContato(jid)} (${e.message}). Usei o link fixo.`.slice(0, 290))
      console.error('Mercado Pago:', e.message)
    }
  }
  db.prepare('UPDATE cobrancas SET link = ?, mp_pref = ? WHERE id = ?').run(link || null, pref, id)
  return { id, link, cartas: restantes }
}

// ---------- Pago / cancelado ----------
export async function marcarPago (id, por, { wa = null, pagamento = null } = {}) {
  const b = pegarCobranca(id)
  if (!b || b.status !== 'pendente') return false
  if (!Number(db.prepare("UPDATE cobrancas SET status = 'pago', pago_em = ?, pago_por = ? WHERE id = ? AND status = 'pendente'").run(Date.now(), por, id).changes)) return false
  const cartas = cartasDaCobranca(id)
  // Remessas com essas cartas que esperavam pagamento passam para "Pago, separar".
  for (const c of cartas) {
    if (c.remessa_id) db.prepare("UPDATE remessas SET status = 'pago' WHERE id = ? AND status = 'aguardando_pagamento'").run(c.remessa_id)
  }
  const forma = pagamento?.payment_type_id === 'bank_transfer' || pagamento?.payment_method_id === 'pix' ? ' (Pix)' : pagamento ? ' (cartão)' : ''
  registrarAtividade(por === 'Mercado Pago' ? 'CartaDex' : por, 'acao',
    `${por === 'Mercado Pago' ? 'Pagamento confirmado pelo Mercado Pago' + forma : 'Marcou como pago'}: ${nomeContato(b.jid)}, ${moeda(b.total)}`.slice(0, 290))
  console.log(`💰 Pagamento de ${nomeContato(b.jid)} (${moeda(b.total)}) confirmado por ${por}`)
  const modelo = cfg('cobranca_msg_pago') || PAGO_PADRAO
  if (wa?.estado?.conectado && cfg('cobranca_avisar_pago') !== '0' && modelo.trim()) {
    try { await wa.enviarTexto(preencher(modelo, cartas, b.jid, b.link), [], destinoDe(b.jid)) } catch (e) {
      console.error('Não consegui mandar a confirmação de pagamento:', e.message)
    }
  }
  return true
}

export function cancelarCobranca (id, por) {
  const b = pegarCobranca(id)
  if (!b || b.status !== 'pendente') return false
  db.prepare("UPDATE cobrancas SET status = 'cancelada', pago_por = ?, cancelada_em = ? WHERE id = ?").run(`parada por ${por}`, Date.now(), id)
  expirar(b).catch(() => {})
  return true
}

// Remessa marcada como paga no painel: as cobranças em aberto só com cartas dela viram pagas
// (para os lembretes pararem). Não manda mensagem ao comprador.
export function pagarPelaRemessa (remessaId, por) {
  const cartas = db.prepare('SELECT id FROM cartas WHERE remessa_id = ?').all(remessaId).map(c => c.id)
  if (!cartas.length) return 0
  const daRemessa = new Set(cartas)
  const abertas = db.prepare(`SELECT DISTINCT b.* FROM cobrancas b JOIN cobranca_cartas cc ON cc.cobranca_id = b.id
    WHERE b.status = 'pendente' AND cc.carta_id IN (${cartas.map(() => '?').join(',')})`).all(...cartas)
  let n = 0
  for (const b of abertas) {
    const delas = cartasDaCobranca(b.id).map(c => c.id)
    if (delas.every(id => daRemessa.has(id))) {
      db.prepare("UPDATE cobrancas SET status = 'pago', pago_em = ?, pago_por = ? WHERE id = ? AND status = 'pendente'").run(Date.now(), por, b.id)
      expirar(b).catch(() => {})
      n++
    } else {
      // Tem cartas de fora da remessa: só para os lembretes; o painel mostra para gerar um link novo.
      db.prepare("UPDATE cobrancas SET status = 'cancelada', pago_por = ?, cancelada_em = ? WHERE id = ? AND status = 'pendente'")
        .run(`remessa #${remessaId} marcada como paga por ${por}`, Date.now(), b.id)
      expirar(b).catch(() => {})
    }
  }
  return n
}

// ---------- Agenda: conferir pagamentos e mandar lembretes ----------
// O horário de lembrete mais recente que já passou (até 3 h atrás), ou null.
export function horarioDoLembrete (agora, horas) {
  let melhor = null
  for (const h of horas) {
    const [hh, mm] = String(h).split(':').map(Number)
    if (!Number.isInteger(hh)) continue
    const d = new Date(agora); d.setHours(hh, mm || 0, 0, 0)
    if (d.getTime() > agora) d.setDate(d.getDate() - 1)
    if (!melhor || d.getTime() > melhor) melhor = d.getTime()
  }
  return melhor && agora - melhor <= 3 * 3600_000 ? melhor : null
}
export const horasDosLembretes = () => String(cfg('cobranca_horas') || '10:00,19:00').split(',').map(s => s.trim()).filter(Boolean)

export async function verificarPagamentos (wa, agora = Date.now()) {
  if (!temMP()) return 0
  let n = 0
  for (const b of cobrancasPendentes().filter(b => b.mp_pref)) {
    try {
      const p = await pagamentoDa(b)
      if (p && await marcarPago(b.id, 'Mercado Pago', { wa, pagamento: p })) n++
    } catch (e) {
      console.error(`Mercado Pago (cobrança ${b.id}):`, e.message)
      if (/Access Token/.test(e.message)) return n
    }
  }
  // Links cancelados ou substituídos nos últimos 7 dias: alguém pode ter pago pelo link antigo.
  const canceladas = db.prepare(`SELECT * FROM cobrancas WHERE status = 'cancelada' AND mp_pref IS NOT NULL
    AND COALESCE(cancelada_em, criada_em) >= ? ORDER BY id DESC LIMIT 30`).all(agora - 7 * 86_400_000)
  for (const b of canceladas) {
    try {
      const p = await pagamentoDa(b)
      if (p) { pagoNoLinkAntigo(b, p); n++ }
    } catch (e) {
      if (/Access Token/.test(e.message)) break
    }
  }
  return n
}

// Pagou por um link que já tinha sido cancelado: a cobrança volta a valer como paga
// e as cobranças em aberto dessas mesmas cartas param (para não cobrar duas vezes).
function pagoNoLinkAntigo (b, p) {
  db.prepare("UPDATE cobrancas SET status = 'pago', pago_em = ?, pago_por = 'Mercado Pago (link antigo)' WHERE id = ? AND status = 'cancelada'").run(Date.now(), b.id)
  const cartas = cartasDaCobranca(b.id)
  for (const c of cartas) {
    if (c.remessa_id) db.prepare("UPDATE remessas SET status = 'pago' WHERE id = ? AND status = 'aguardando_pagamento'").run(c.remessa_id)
  }
  const ids = cartas.map(c => c.id)
  const outras = ids.length ? db.prepare(`SELECT DISTINCT b.id FROM cobrancas b JOIN cobranca_cartas cc ON cc.cobranca_id = b.id
    WHERE b.status = 'pendente' AND cc.carta_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : []
  for (const o of outras) {
    db.prepare("UPDATE cobrancas SET status = 'cancelada', pago_por = 'pago pelo link antigo', cancelada_em = ? WHERE id = ?").run(Date.now(), o.id)
  }
  const aviso = `Pagamento recebido num link antigo (cancelado): ${nomeContato(b.jid)}, ${moeda(Math.round(Number(p.transaction_amount) * 100) || b.total)}. Confira em Pagamentos` +
    (outras.length ? ' (a cobrança nova dessas cartas foi parada)' : '')
  registrarAtividade('CartaDex', 'acao', aviso.slice(0, 290))
  console.log('💰 ' + aviso)
}

async function enviarLembrete (wa, b, cartas, agora) {
  try {
    await wa.enviarTexto(preencher(cfg('cobranca_msg') || LEMBRETE_PADRAO, cartas, b.jid, b.link), [], destinoDe(b.jid))
    db.prepare('UPDATE cobrancas SET lembretes = lembretes + 1, ultimo_lembrete = ? WHERE id = ?').run(agora, b.id)
    registrarAtividade('CartaDex', 'acao', `Lembrete de pagamento para ${nomeContato(b.jid)} (${moeda(b.total)}), ${b.lembretes + 1}º`.slice(0, 290))
    return true
  } catch (e) {
    // Não marca como lembrado: tenta de novo na próxima volta (dentro da janela do mesmo horário).
    registrarAtividade('CartaDex', 'acao', `Não consegui mandar o lembrete para ${nomeContato(b.jid)}: ${e.message}`.slice(0, 290))
    console.error(`Não consegui mandar o lembrete para ${nomeContato(b.jid)}:`, e.message)
    return false
  }
}

// Lembrete na hora, pelo botão do painel.
export async function lembrarAgora (wa, id) {
  const b = pegarCobranca(id)
  if (!b || b.status !== 'pendente') throw new Error('essa cobrança não está mais em aberto')
  if (!wa?.estado?.conectado) throw new Error('WhatsApp desconectado')
  const cartas = cartasDaCobranca(id)
  if (!await enviarLembrete(wa, b, cartas, Date.now())) throw new Error('o WhatsApp não aceitou a mensagem (veja Atividade)')
  return true
}

// Quando sai o próximo lembrete desta cobrança (para mostrar no painel), ou null.
export function proximoLembrete (b, agora = Date.now()) {
  if (cfg('cobranca_ativo') !== '1' || b.status !== 'pendente') return null
  const horas = horasDosLembretes()
  for (let dia = 0; dia < 3; dia++) {
    const candidatos = horas.map(h => {
      const [hh, mm] = String(h).split(':').map(Number)
      const d = new Date(agora); d.setDate(d.getDate() + dia); d.setHours(hh, mm || 0, 0, 0)
      return d.getTime()
    }).sort((x, y) => x - y)
    for (const t of candidatos) {
      if (t + 3 * 3600_000 < agora) continue
      if (t < b.criada_em) continue
      if ((b.ultimo_lembrete || 0) >= t) continue
      return Math.max(t, agora)
    }
  }
  return null
}

export async function mandarLembretes (wa, agora = Date.now()) {
  if (cfg('cobranca_ativo') !== '1' || !wa?.estado?.conectado) return 0
  const horario = horarioDoLembrete(agora, horasDosLembretes())
  if (!horario) return 0
  let n = 0; let falhas = 0
  for (const b of cobrancasPendentes()) {
    if (horario < b.criada_em) continue // horário de antes da dívida existir não conta
    if ((b.ultimo_lembrete || 0) >= horario) continue // já lembrou neste horário
    const atual = pegarCobranca(b.id)
    if (atual?.status !== 'pendente') continue
    const cartas = cartasDaCobranca(b.id)
    if (!cartas.length) { cancelarCobranca(b.id, 'sistema (sem cartas)'); continue }
    if (!wa.estado?.conectado) break // caiu no meio: o resto fica para a próxima volta
    if (n || falhas) await esperar(5000 + Math.random() * 5000)
    if (await enviarLembrete(wa, b, cartas, agora)) n++
    else if (++falhas >= 3) break // várias falhas seguidas: provavelmente o WhatsApp está com problema
  }
  if (n) console.log(`⏰ ${n} lembrete(s) de pagamento enviado(s)`)
  return n
}

// Chamado pelo agendador. Roda em segundo plano, sem duas voltas ao mesmo tempo.
let rodando = false
export async function cuidarDasCobrancas (wa, agora = Date.now()) {
  if (rodando) return
  rodando = true
  try {
    // Pagamentos: a cada 2 minutos.
    if (agora - (Number(cfg('cobranca_conferida')) || 0) >= 2 * 60_000) {
      setCfg('cobranca_conferida', String(agora))
      await verificarPagamentos(wa)
    }
    await mandarLembretes(wa, agora)
  } finally {
    rodando = false
  }
}
