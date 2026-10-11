// Cobranças: o link de pagamento de cada ganhador, a conferência automática do pagamento
// (Mercado Pago) e os lembretes para quem ainda não pagou.
import { randomBytes } from 'node:crypto'
import { db, cfg, setCfg, registrarAtividade, nomeContato } from './db.js'
import { moeda, numCarta } from './leilao.js'
import { temMP, criarLinkMP, pagamentoAprovado, expirarLinkMP, pagamentoPorId, pagamentosDaReferencia, cancelarPagamentoMP } from './mercadopago.js'

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
// Número do pagamento do Mercado Pago que quitou a cobrança (para reconhecer um segundo pagamento).
try { db.exec('ALTER TABLE cobrancas ADD COLUMN mp_pagamento TEXT') } catch {}
// Pagamentos em dobro já avisados (para não avisar de novo a cada conferência).
db.exec('CREATE TABLE IF NOT EXISTS pagamentos_em_dobro (pagamento TEXT PRIMARY KEY, cobranca_id INTEGER, ts INTEGER)')
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

// ---------- Pix com validade curta ----------
// Cada vez que a pessoa escolhe Pix no link, o Mercado Pago gera um código novo, que valeria 24 horas.
// Com vários códigos valendo ao mesmo tempo, dava para pagar duas vezes. Por isso o bot cancela
// cada código de Pix que ficou 5 minutos sem ser pago. O link continua valendo: abrindo de novo, sai um código novo.
export const PIX_VALIDADE = 5 * 60_000
export const ehPixEsperando = p => Boolean(p) && p.status === 'pending' && (p.payment_method_id === 'pix' || p.payment_type_id === 'bank_transfer')
const prazosDoPix = new Map() // número do pagamento -> timer

async function cancelarPix (id, motivo) {
  id = String(id)
  clearTimeout(prazosDoPix.get(id)); prazosDoPix.delete(id)
  try {
    await cancelarPagamentoMP(id)
    console.log(`⌛ Código Pix ${id} cancelado (${motivo})`)
    return true
  } catch (e) {
    console.error(`Mercado Pago (cancelar Pix ${id}):`, e.message)
    return false
  }
}

// Marca a hora de cancelar o código (5 minutos depois de criado). Se o bot reiniciar, a conferência acha de novo.
function prazoDoPix (p, agora = Date.now()) {
  const id = String(p.id)
  if (prazosDoPix.has(id)) return
  const criado = Date.parse(p.date_created || '')
  const falta = Math.max(0, (Number.isFinite(criado) ? criado : agora) + PIX_VALIDADE - agora)
  const t = setTimeout(async () => {
    prazosDoPix.delete(id)
    try {
      const atual = await pagamentoPorId(id)
      if (ehPixEsperando(atual)) await cancelarPix(id, '5 minutos sem pagar')
    } catch (e) { console.error(`Mercado Pago (Pix ${id}):`, e.message) }
  }, falta)
  t.unref?.()
  prazosDoPix.set(id, t)
}

// Olha os códigos de Pix esperando pagamento: cancela todos (cobrança que não está mais em aberto)
// ou só os que já passaram dos 5 minutos (os outros ficam com a hora marcada).
async function cuidarDosPix (lista, { todos = false, agora = Date.now() } = {}) {
  let n = 0
  for (const p of lista.filter(ehPixEsperando)) {
    const criado = Date.parse(p.date_created || '')
    if (todos || !Number.isFinite(criado) || agora - criado >= PIX_VALIDADE) { if (await cancelarPix(p.id, todos ? 'cobrança fechada' : '5 minutos sem pagar')) n++ } else prazoDoPix(p, agora)
  }
  return n
}

// Link que não vale mais (pago, substituído ou parado): pede ao Mercado Pago para expirar o link e cancela
// os códigos de Pix dele que ainda esperam pagamento. Se não der, tudo bem: a conferência tenta de novo.
async function expirar (b) {
  if (!b?.mp_pref || !temMP()) return
  try { await expirarLinkMP(b.mp_pref) } catch (e) { console.error(`Mercado Pago (expirar link da cobrança ${b.id}):`, e.message) }
  try { await cuidarDosPix(await pagamentosDaReferencia(referencia(b)), { todos: true }) } catch (e) {
    console.error(`Mercado Pago (Pix da cobrança ${b.id}):`, e.message)
  }
}

// Um segundo pagamento aprovado para uma cobrança que já estava paga: avisa uma vez só, para devolver.
function pagamentoEmDobro (b, p) {
  const id = String(p.id)
  if (b.mp_pagamento === id) return false
  if (!b.mp_pagamento && /^Mercado Pago/.test(b.pago_por || '')) return false // paga antes de o bot guardar o número
  if (!Number(db.prepare('INSERT OR IGNORE INTO pagamentos_em_dobro (pagamento, cobranca_id, ts) VALUES (?, ?, ?)').run(id, b.id, Date.now()).changes)) return false
  const aviso = `⚠️ Pagamento em dobro: ${nomeContato(b.jid)} pagou de novo ${moeda(Math.round(Number(p.transaction_amount) * 100) || b.total)} ` +
    `(pagamento ${id} no Mercado Pago) por uma cobrança que já estava paga. Devolva pelo app do Mercado Pago`
  registrarAtividade('CartaDex', 'acao', aviso.slice(0, 290))
  console.log(aviso)
  return true
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
  if (!Number(db.prepare("UPDATE cobrancas SET status = 'pago', pago_em = ?, pago_por = ?, mp_pagamento = ? WHERE id = ? AND status = 'pendente'")
    .run(Date.now(), por, pagamento?.id != null ? String(pagamento.id) : null, id).changes)) return false
  // O link para de aceitar pagamento e os códigos de Pix em aberto são cancelados (para não pagar duas vezes).
  expirar(b).catch(() => {})
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
      const lista = await pagamentosDaReferencia(referencia(b))
      const p = lista.find(x => x.status === 'approved' && pagamentoConfere(x, b))
      if (p) { if (await marcarPago(b.id, 'Mercado Pago', { wa, pagamento: p })) n++ } else await cuidarDosPix(lista, { agora })
    } catch (e) {
      console.error(`Mercado Pago (cobrança ${b.id}):`, e.message)
      if (/Access Token/.test(e.message)) return n
    }
  }
  // Links cancelados ou substituídos nos últimos 7 dias: alguém pode ter pago pelo link antigo.
  // E pagas nas últimas 2 horas: confere se não entrou um segundo pagamento.
  const fechadas = db.prepare(`SELECT * FROM cobrancas WHERE mp_pref IS NOT NULL AND (
      (status = 'cancelada' AND COALESCE(cancelada_em, criada_em) >= ?) OR (status = 'pago' AND pago_em >= ?)
    ) ORDER BY id DESC LIMIT 40`).all(agora - 7 * 86_400_000, agora - 2 * 3600_000)
  for (const b of fechadas) {
    try {
      const lista = await pagamentosDaReferencia(referencia(b))
      await cuidarDosPix(lista, { todos: true, agora })
      const aprovados = lista.filter(x => x.status === 'approved' && pagamentoConfere(x, b))
      if (b.status === 'cancelada' && aprovados.length) { pagoNoLinkAntigo(b, aprovados[0]); n++ } else if (b.status === 'pago') for (const p of aprovados) pagamentoEmDobro(b, p)
    } catch (e) {
      if (/Access Token/.test(e.message)) break
    }
  }
  return n
}

// Pagou por um link que já tinha sido cancelado: a cobrança volta a valer como paga
// e as cobranças em aberto dessas mesmas cartas param (para não cobrar duas vezes).
function pagoNoLinkAntigo (b, p) {
  db.prepare("UPDATE cobrancas SET status = 'pago', pago_em = ?, pago_por = 'Mercado Pago (link antigo)', mp_pagamento = ? WHERE id = ? AND status = 'cancelada'")
    .run(Date.now(), p.id != null ? String(p.id) : null, b.id)
  const cartas = cartasDaCobranca(b.id)
  for (const c of cartas) {
    if (c.remessa_id) db.prepare("UPDATE remessas SET status = 'pago' WHERE id = ? AND status = 'aguardando_pagamento'").run(c.remessa_id)
  }
  const ids = cartas.map(c => c.id)
  const outras = ids.length ? db.prepare(`SELECT DISTINCT b.id FROM cobrancas b JOIN cobranca_cartas cc ON cc.cobranca_id = b.id
    WHERE b.status = 'pendente' AND cc.carta_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : []
  for (const o of outras) {
    db.prepare("UPDATE cobrancas SET status = 'cancelada', pago_por = 'pago pelo link antigo', cancelada_em = ? WHERE id = ?").run(Date.now(), o.id)
    expirar(pegarCobranca(o.id)).catch(() => {})
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
    // Pagamentos (e códigos de Pix vencidos): a cada minuto.
    if (agora - (Number(cfg('cobranca_conferida')) || 0) >= 55_000) {
      setCfg('cobranca_conferida', String(agora))
      await verificarPagamentos(wa)
    }
    await mandarLembretes(wa, agora)
  } finally {
    rodando = false
  }
}

// ---------- Aviso na hora (webhook do Mercado Pago) ----------
// O aviso só diz "o pagamento X mudou". O conteúdo dele não é confiável (qualquer um poderia mandar),
// então o bot usa só o número e pergunta direto ao Mercado Pago, com o token da conta, como está esse pagamento.
const avisosRecentes = new Map()
export async function avisoDoMP (idBruto, wa, agora = Date.now()) {
  const id = String(idBruto ?? '').trim()
  if (!/^\d{1,20}$/.test(id)) return 'ignorado'
  if ((avisosRecentes.get(id) || 0) > agora - 30_000) return 'repetido'
  avisosRecentes.set(id, agora)
  if (avisosRecentes.size > 500) for (const [k, t] of avisosRecentes) if (t < agora - 30_000) avisosRecentes.delete(k)
  if (!temMP()) return 'sem Mercado Pago'
  const p = await pagamentoPorId(id)
  if (!p) return 'pagamento não existe'
  if (ehPixEsperando(p)) {
    // Código de Pix novo: marca a hora de cancelar. Se a cobrança já fechou, cancela na hora.
    const dona = db.prepare('SELECT status FROM cobrancas WHERE ref = ?').get(String(p.external_reference || ''))
    if (dona && dona.status !== 'pendente') { await cancelarPix(id, 'cobrança fechada'); return 'pix cancelado' }
    prazoDoPix(p, agora)
    return 'pix esperando'
  }
  if (p.status !== 'approved') return `pagamento ${p.status || 'sem status'}`
  const ref = String(p.external_reference || '')
  const antigo = /^cartadex-(\d+)$/.exec(ref)
  const b = db.prepare('SELECT * FROM cobrancas WHERE ref = ?').get(ref) ||
    (antigo ? db.prepare('SELECT * FROM cobrancas WHERE id = ? AND ref IS NULL').get(Number(antigo[1])) : undefined)
  if (!b) return 'não é de nenhuma cobrança'
  if (!pagamentoConfere(p, b)) return 'valor ou data não conferem'
  if (b.status === 'pendente') return (await marcarPago(b.id, 'Mercado Pago', { wa, pagamento: p })) ? 'pago' : 'já estava pago'
  if (b.status === 'cancelada' && b.mp_pref) { pagoNoLinkAntigo(b, p); return 'pago (link antigo)' }
  return pagamentoEmDobro(b, p) ? 'pago em dobro' : 'já estava pago'
}
