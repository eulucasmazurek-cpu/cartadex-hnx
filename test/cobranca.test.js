// Cobrança: link do Mercado Pago por ganhador, confirmação automática e lembretes até pagar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-cobranca-'))
const { db, setCfg, cfg } = await import('../src/db.js')
const C = await import('../src/cobranca.js')
const MP = await import('../src/mercadopago.js')
const G = await import('../src/ganhador.js')
C._semEsperaCobranca(); G._semEspera()

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Lote', 0)").run().lastInsertRowid)
const vendida = (desc, valor, quem) => {
  const id = Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, status, vencedor, valor_venda, encerrada_em)
    VALUES (?, 'sem.jpg', ?, 1000, 2000, 3000, 'vendida', ?, ?, ?)`).run(lote, desc, quem, valor, Date.now()).lastInsertRowid)
  return db.prepare('SELECT * FROM cartas WHERE id = ?').get(id)
}
db.prepare("INSERT OR REPLACE INTO contatos VALUES ('1@lid', 'Ana Lima', '+5547911110000')").run()
db.prepare("INSERT OR REPLACE INTO contatos VALUES ('2@lid', 'Beto', '+5547922220000')").run()

function whats () {
  const log = []
  return { log, estado: { conectado: true }, enviarTexto: async (t, m, para) => log.push([para, t]), enviarFoto: async () => {} }
}

// Mercado Pago de mentira: guarda as chamadas e responde como a API.
const chamadas = []
const aprovados = new Set()
const expirados = []
const detalhes = {} // ref -> campos extras do pagamento aprovado (valor, data)
const pagamentosPorId = {} // id -> pagamento (para o aviso na hora)
const extras = {} // ref -> pagamentos a mais (Pix esperando, segundo pagamento...)
const pixCancelados = []
let pref = 0
MP._usarFetch(async (url, op) => {
  chamadas.push({ url, op })
  const resp = (status, corpo) => ({ ok: status < 300, status, text: async () => JSON.stringify(corpo) })
  if (op.headers.Authorization !== 'Bearer APP_USR-teste-1234567890-abcdefghij') return resp(401, { message: 'invalid token' })
  if (/\/checkout\/preferences\/P\d+$/.test(url) && op.method === 'PUT') { expirados.push(url.split('/').pop()); return resp(200, {}) }
  if (url.endsWith('/checkout/preferences')) { pref++; return resp(201, { id: 'P' + pref, init_point: `https://mpago.test/pagar/P${pref}` }) }
  if (url.includes('/v1/payments/search')) {
    const ref = new URL(url).searchParams.get('external_reference')
    const base = aprovados.has(ref) ? [{ id: 9, status: 'approved', payment_method_id: 'pix', payment_type_id: 'bank_transfer', ...(detalhes[ref] || {}) }] : [{ id: 8, status: 'pending' }]
    return resp(200, { results: [...(extras[ref] || []), ...base] })
  }
  if (url.endsWith('/users/me')) return resp(200, { nickname: 'LOJACARTAS' })
  { const m = /\/v1\/payments\/(\d+)$/.exec(url); if (m && op.method === 'PUT') { pixCancelados.push(m[1]); for (const l of Object.values(extras)) for (const p of l) if (String(p.id) === m[1]) p.status = 'cancelled'; return resp(200, {}) } }
  { const m = /\/v1\/payments\/(\d+)$/.exec(url); if (m) return pagamentosPorId[m[1]] ? resp(200, pagamentosPorId[m[1]]) : resp(404, { message: 'not found' }) }
  return resp(404, {})
})

test('sem Mercado Pago: usa o link fixo com o valor', async () => {
  setCfg('mp_token', ''); setCfg('ganhador_link', 'https://loja.com/pix?v={valor}')
  const c = vendida('Pikachu', 4550, '1@lid')
  const r = await C.criarCobranca('1@lid', [c])
  assert.equal(r.link, 'https://loja.com/pix?v=45.50')
  assert.equal(C.pegarCobranca(r.id).mp_pref, null)
  C.cancelarCobranca(r.id, 'teste')
})

test('com Mercado Pago: link próprio com as cartas; mesma cobrança é reaproveitada', async () => {
  setCfg('mp_token', 'APP_USR-teste-1234567890-abcdefghij')
  assert.equal(await MP.contaMP(), 'LOJACARTAS')
  const a = vendida('Charizard ex\n199/165', 15000, '1@lid')
  const b = vendida('Mew', 5000, '1@lid')
  const r = await C.criarCobranca('1@lid', [a, b])
  assert.match(r.link, /^https:\/\/mpago\.test\/pagar\/P\d+$/)
  const corpo = JSON.parse(chamadas.find(x => x.url.endsWith('/checkout/preferences')).op.body)
  assert.equal(corpo.items.length, 2); assert.equal(corpo.items[0].unit_price, 150); assert.equal(corpo.items[0].currency_id, 'BRL')
  assert.match(corpo.items[0].title, /Charizard ex$/)
  assert.equal(corpo.external_reference, C.pegarCobranca(r.id).ref)
  assert.match(corpo.external_reference, new RegExp(`^cartadex-${r.id}-[0-9a-f]{8}$`))
  assert.deepEqual(corpo.payment_methods.excluded_payment_types, [{ id: 'ticket' }])
  assert.ok(chamadas.at(-1).op.headers['X-Idempotency-Key'])
  const de_novo = await C.criarCobranca('1@lid', [b, a])
  assert.equal(de_novo.id, r.id); assert.equal(de_novo.link, r.link)
})

test('token errado: cai no link fixo e registra', async () => {
  setCfg('mp_token', 'APP_USR-errado-1234567890-abcdefghij')
  const c = vendida('Eevee', 2000, '2@lid')
  const r = await C.criarCobranca('2@lid', [c])
  assert.equal(r.link, 'https://loja.com/pix?v=20.00')
  await assert.rejects(MP.contaMP(), /inválido/)
  C.cancelarCobranca(r.id, 'teste')
  setCfg('mp_token', 'APP_USR-teste-1234567890-abcdefghij')
})

test('pagamento aprovado: marca pago, confirma para a pessoa e libera a remessa', async () => {
  const wa = whats()
  const c = vendida('Gengar', 3000, '2@lid')
  const r = await C.criarCobranca('2@lid', [c])
  const rem = Number(db.prepare("INSERT INTO remessas (comprador, criada_em) VALUES ('2@lid', 0)").run().lastInsertRowid)
  db.prepare('UPDATE cartas SET remessa_id = ? WHERE id = ?').run(rem, c.id)
  assert.equal(await C.verificarPagamentos(wa), 0)
  aprovados.add(C.pegarCobranca(r.id).ref)
  assert.equal(await C.verificarPagamentos(wa), 1)
  assert.equal(C.pegarCobranca(r.id).status, 'pago'); assert.equal(C.pegarCobranca(r.id).pago_por, 'Mercado Pago')
  assert.equal(db.prepare('SELECT status FROM remessas WHERE id = ?').get(rem).status, 'pago')
  assert.equal(wa.log[0][0], '5547922220000@s.whatsapp.net'); assert.match(wa.log[0][1], /Pagamento recebido, Beto/)
  assert.equal(await C.verificarPagamentos(wa), 0) // não confirma duas vezes
  // Reenviar o aviso de cartas já pagas não cria cobrança nova.
  assert.equal(await C.criarCobranca('2@lid', [c]), null)
})

test('horário do lembrete', () => {
  const d = (h, m = 0) => { const x = new Date(2026, 9, 8, h, m); return x.getTime() }
  assert.equal(C.horarioDoLembrete(d(10, 5), ['10:00', '19:00']), d(10))
  assert.equal(C.horarioDoLembrete(d(19, 30), ['10:00', '19:00']), d(19))
  assert.equal(C.horarioDoLembrete(d(15), ['10:00', '19:00']), null) // passou mais de 3 h
  assert.equal(C.horarioDoLembrete(d(1), ['23:00']), new Date(2026, 9, 7, 23).getTime())
})

test('lembretes: 2 por dia até pagar, a partir do primeiro horário depois do aviso', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  setCfg('cobranca_ativo', '1'); setCfg('cobranca_horas', '10:00,19:00')
  const wa = whats()
  const c = vendida('Snorlax', 8000, '1@lid')
  const r = await C.criarCobranca('1@lid', [c])
  const dia = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime()
  db.prepare('UPDATE cobrancas SET criada_em = ? WHERE id = ?').run(dia(8, 8), r.id)

  assert.equal(await C.mandarLembretes(wa, dia(8, 7, 59)), 0) // antes do horário
  assert.equal(await C.mandarLembretes(wa, dia(8, 10, 0)), 1) // bateu 10:00: manda na hora
  assert.match(wa.log[0][1], /lembrar do pagamento de a carta #\d+/); assert.match(wa.log[0][1], /mpago\.test/)
  assert.equal(await C.mandarLembretes(wa, dia(8, 10, 30)), 0) // mesmo horário: não repete
  assert.equal(await C.mandarLembretes(wa, dia(8, 19, 1)), 1)
  assert.equal(await C.mandarLembretes(wa, dia(8, 23)), 0) // fora de horário
  assert.equal(await C.mandarLembretes(wa, dia(9, 10, 2)), 1)
  assert.equal(await C.mandarLembretes(wa, dia(9, 19, 2)), 1)
  assert.equal(C.pegarCobranca(r.id).lembretes, 4)

  setCfg('cobranca_ativo', '0')
  assert.equal(await C.mandarLembretes(wa, dia(10, 10, 2)), 0)
  setCfg('cobranca_ativo', '1')
  assert.equal(await C.marcarPago(r.id, 'Lucas', { wa }), true)
  assert.equal(await C.mandarLembretes(wa, dia(10, 19, 2)), 0) // pago: parou
})

test('parar cobrança', async () => {
  const wa = whats()
  const c = vendida('Mewtwo', 9000, '2@lid')
  const r = await C.criarCobranca('2@lid', [c])
  db.prepare('UPDATE cobrancas SET criada_em = 0 WHERE id = ?').run(r.id)
  assert.equal(C.cancelarCobranca(r.id, 'Lucas'), true)
  assert.equal(await C.mandarLembretes(wa, new Date(2026, 9, 8, 10, 1).getTime()), 0)
  assert.equal(C.cancelarCobranca(r.id, 'Lucas'), false)
})

test('aviso do ganhador usa o link do Mercado Pago', async () => {
  setCfg('ganhador_ativo', '1')
  const wa = whats()
  const c = vendida('Lugia', 12000, '1@lid')
  const r = await G.avisarGanhadores(wa, [{ carta: c, vencedor: { votante: '1@lid' } }])
  assert.equal(r.enviados, 1)
  assert.match(wa.log.at(-1)[1], /Pague por aqui: https:\/\/mpago\.test\/pagar\/P\d+/)
  assert.ok(C.cobrancaDaCarta(c.id))
})

test('espera de 1 hora (padrão), próximo lembrete e lembrar agora', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  setCfg('cobranca_ativo', '1'); setCfg('cobranca_horas', '10:00,19:00')
  const wa = whats()
  const c = vendida('Eevee', 2000, '2@lid')
  const r = await C.criarCobranca('2@lid', [c])
  const dia = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime()
  db.prepare('UPDATE cobrancas SET criada_em = ? WHERE id = ?').run(dia(8, 8, 30), r.id)
  assert.equal(C.proximoLembrete(C.pegarCobranca(r.id), dia(8, 9)), dia(8, 10))
  assert.equal(await C.mandarLembretes(wa, dia(8, 10, 1)), 1)
  assert.equal(C.proximoLembrete(C.pegarCobranca(r.id), dia(8, 10, 5)), dia(8, 19))
  await C.lembrarAgora(wa, r.id)
  assert.equal(C.pegarCobranca(r.id).lembretes, 2)
  setCfg('cobranca_ativo', '0')
  assert.equal(C.proximoLembrete(C.pegarCobranca(r.id), dia(8, 11)), null)
  setCfg('cobranca_ativo', '1')
  C.cancelarCobranca(r.id, 'teste')
  await assert.rejects(C.lembrarAgora(wa, r.id), /não está mais em aberto/)
})

test('horário com minutos: quem ganhou depois do horário espera o próximo', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  setCfg('cobranca_ativo', '1'); setCfg('cobranca_horas', '16:05,21:35')
  const wa = whats()
  const c = vendida('Mew', 5000, '1@lid')
  const r = await C.criarCobranca('1@lid', [c])
  const dia = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime()
  db.prepare('UPDATE cobrancas SET criada_em = ? WHERE id = ?').run(dia(8, 16, 2), r.id)
  assert.equal(await C.mandarLembretes(wa, dia(8, 16, 4)), 0)
  assert.equal(await C.mandarLembretes(wa, dia(8, 16, 5)), 1) // 3 min depois do aviso: sem trava
  db.prepare('UPDATE cobrancas SET criada_em = ?, ultimo_lembrete = NULL WHERE id = ?').run(dia(8, 16, 10), r.id)
  assert.equal(await C.mandarLembretes(wa, dia(8, 16, 11)), 0) // ganhou depois das 16:05
  assert.equal(C.proximoLembrete(C.pegarCobranca(r.id), dia(8, 16, 11)), dia(8, 21, 35))
  C.cancelarCobranca(r.id, 'teste')
})

test('pagamento de outra cobrança com a mesma referência (backup restaurado) não vale', async () => {
  const wa = whats()
  const c = vendida('Lugia', 9000, '1@lid')
  const r = await C.criarCobranca('1@lid', [c])
  const b = C.pegarCobranca(r.id)
  // Valor menor que o da cobrança: não é desta.
  aprovados.add(b.ref); detalhes[b.ref] = { transaction_amount: 40, date_created: new Date().toISOString() }
  assert.equal(await C.verificarPagamentos(wa), 0)
  // Pago antes de a cobrança existir: também não.
  detalhes[b.ref] = { transaction_amount: 90, date_created: new Date(b.criada_em - 86_400_000).toISOString() }
  assert.equal(await C.verificarPagamentos(wa), 0)
  assert.equal(C.pegarCobranca(r.id).status, 'pendente')
  detalhes[b.ref] = { transaction_amount: 90, date_created: new Date().toISOString() }
  assert.equal(await C.verificarPagamentos(wa), 1)
  assert.equal(C.pegarCobranca(r.id).status, 'pago')
})

test('link cancelado expira no Mercado Pago; se pagarem por ele mesmo assim, vale e a cobrança nova para', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  const wa = whats()
  const a = vendida('Ho-Oh', 7000, '2@lid')
  const b2 = vendida('Celebi', 3000, '2@lid')
  const velha = await C.criarCobranca('2@lid', [a])
  const nova = await C.criarCobranca('2@lid', [a, b2]) // substitui a velha
  assert.equal(C.pegarCobranca(velha.id).status, 'cancelada')
  await new Promise(r => setTimeout(r, 10))
  assert.ok(expirados.includes(C.pegarCobranca(velha.id).mp_pref))
  aprovados.add(C.pegarCobranca(velha.id).ref)
  assert.equal(await C.verificarPagamentos(wa), 1)
  assert.equal(C.pegarCobranca(velha.id).status, 'pago')
  assert.equal(C.pegarCobranca(nova.id).status, 'cancelada')
  assert.ok(C.cartaPaga(a.id)); assert.ok(!C.cartaPaga(b2.id))
})

test('remessa marcada como paga: a cobrança dela vira paga e os lembretes param', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  const c = vendida('Raikou', 6000, '1@lid')
  const r = await C.criarCobranca('1@lid', [c])
  const rem = Number(db.prepare("INSERT INTO remessas (comprador, criada_em) VALUES ('1@lid', 0)").run().lastInsertRowid)
  db.prepare('UPDATE cartas SET remessa_id = ? WHERE id = ?').run(rem, c.id)
  assert.equal(C.pagarPelaRemessa(rem, 'Lucas'), 1)
  assert.equal(C.pegarCobranca(r.id).status, 'pago')
  assert.equal(C.contarPendentes(), 0)
  assert.ok(C.cartaPaga(c.id))
  const aReceber = db.prepare(C.SQL_A_RECEBER).get().v
  const semPagar = db.prepare(`SELECT COALESCE(SUM(valor_venda),0) v FROM cartas WHERE id = ?`).get(c.id).v
  assert.ok(semPagar > 0)
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM (${C.SQL_A_RECEBER.replace('COALESCE(SUM(c.valor_venda), 0) v', 'c.id')}) WHERE id = ?`).get(c.id).n, 0)
  assert.ok(aReceber >= 0)
})

test('lembrete que não saiu não conta como enviado; tenta de novo', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  setCfg('cobranca_ativo', '1'); setCfg('cobranca_horas', '10:00')
  const c = vendida('Suicune', 4000, '1@lid')
  const r = await C.criarCobranca('1@lid', [c])
  const dia = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime()
  db.prepare('UPDATE cobrancas SET criada_em = ? WHERE id = ?').run(dia(8, 8), r.id)
  const ruim = { estado: { conectado: true }, enviarTexto: async () => { throw new Error('falhou') } }
  assert.equal(await C.mandarLembretes(ruim, dia(8, 10, 1)), 0)
  assert.equal(C.pegarCobranca(r.id).ultimo_lembrete, null)
  const wa = whats()
  assert.equal(await C.mandarLembretes(wa, dia(8, 10, 21)), 1)
  C.cancelarCobranca(r.id, 'teste')
})

test('aviso na hora do Mercado Pago: confere direto no Mercado Pago antes de marcar como pago', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  setCfg('endereco_publico', 'https://painel.exemplo.com.br')
  const wa = whats()
  const c = vendida('Mewtwo', 2500, '1@lid')
  const antes = chamadas.length
  const r = await C.criarCobranca('1@lid', [c])
  const corpo = JSON.parse(chamadas.slice(antes).find(x => x.url.endsWith('/checkout/preferences')).op.body)
  assert.equal(corpo.notification_url, 'https://painel.exemplo.com.br/mp/aviso?source_news=webhooks')
  const b = C.pegarCobranca(r.id)
  // Aviso de um pagamento que não existe, ou que não foi aprovado: nada muda.
  assert.equal(await C.avisoDoMP('111', wa), 'pagamento não existe')
  pagamentosPorId['222'] = { id: 222, status: 'pending', external_reference: b.ref }
  assert.equal(await C.avisoDoMP('222', wa), 'pagamento pending')
  // Aprovado, mas de outra cobrança ou com valor menor: não vale.
  pagamentosPorId['333'] = { id: 333, status: 'approved', external_reference: 'cartadex-99999-ffffffff' }
  assert.equal(await C.avisoDoMP('333', wa), 'não é de nenhuma cobrança')
  pagamentosPorId['444'] = { id: 444, status: 'approved', external_reference: b.ref, transaction_amount: 1 }
  assert.equal(await C.avisoDoMP('444', wa), 'valor ou data não conferem')
  assert.equal(C.pegarCobranca(r.id).status, 'pendente')
  // Certo: marca como pago e confirma para a pessoa.
  pagamentosPorId['555'] = { id: 555, status: 'approved', external_reference: b.ref, transaction_amount: 25, payment_method_id: 'pix', payment_type_id: 'bank_transfer' }
  assert.equal(await C.avisoDoMP('555', wa), 'pago')
  assert.equal(C.pegarCobranca(r.id).status, 'pago')
  assert.match(wa.log.at(-1)[1], /Pagamento recebido/)
  // O mesmo aviso repetido não faz nada de novo.
  assert.equal(await C.avisoDoMP('555', wa), 'repetido')
  assert.equal(await C.avisoDoMP('abc', wa), 'ignorado')
  setCfg('endereco_publico', '')
})

test('Pix vale 5 minutos: código vencido é cancelado; ao pagar, os outros códigos são cancelados; segundo pagamento gera aviso', async () => {
  for (const b of C.cobrancasPendentes()) C.cancelarCobranca(b.id, 'limpeza')
  const wa = whats()
  const agora = Date.now()
  const c = vendida('Gengar', 3000, '7@lid')
  const r = await C.criarCobranca('7@lid', [c])
  const b = C.pegarCobranca(r.id)
  const velho = { id: 701, status: 'pending', payment_method_id: 'pix', payment_type_id: 'bank_transfer', date_created: new Date(agora - 6 * 60_000).toISOString() }
  const novo = { id: 702, status: 'pending', payment_method_id: 'pix', payment_type_id: 'bank_transfer', date_created: new Date(agora - 60_000).toISOString() }
  const cartao = { id: 703, status: 'pending', payment_method_id: 'visa', payment_type_id: 'credit_card', date_created: new Date(agora - 60 * 60_000).toISOString() }
  extras[b.ref] = [velho, novo, cartao]
  await C.verificarPagamentos(wa, agora)
  assert.ok(pixCancelados.includes('701'), 'Pix de 6 minutos é cancelado')
  assert.ok(!pixCancelados.includes('702'), 'Pix de 1 minuto continua valendo')
  assert.ok(!pixCancelados.includes('703'), 'cartão não é mexido')
  assert.equal(C.pegarCobranca(r.id).status, 'pendente')
  // Pagou: a cobrança fecha e o código que sobrou é cancelado.
  extras[b.ref].unshift({ id: 704, status: 'approved', payment_method_id: 'pix', payment_type_id: 'bank_transfer', transaction_amount: 30, date_created: new Date(agora).toISOString() })
  await C.verificarPagamentos(wa, agora)
  const paga = C.pegarCobranca(r.id)
  assert.equal(paga.status, 'pago'); assert.equal(paga.mp_pagamento, '704')
  await new Promise(res => setTimeout(res, 20))
  assert.ok(pixCancelados.includes('702'), 'código que sobrou é cancelado ao pagar')
  // Entrou um segundo pagamento: avisa uma vez só.
  extras[b.ref].unshift({ id: 705, status: 'approved', payment_method_id: 'pix', payment_type_id: 'bank_transfer', transaction_amount: 30, date_created: new Date(agora).toISOString() })
  await C.verificarPagamentos(wa, agora)
  await C.verificarPagamentos(wa, agora)
  const avisos = db.prepare("SELECT * FROM atividade WHERE texto LIKE '%Pagamento em dobro%' AND texto LIKE '%705%'").all()
  assert.equal(avisos.length, 1)
  // Aviso na hora de um Pix novo de cobrança já paga: cancela na hora.
  pagamentosPorId['706'] = { id: 706, status: 'pending', payment_method_id: 'pix', payment_type_id: 'bank_transfer', external_reference: b.ref, date_created: new Date().toISOString() }
  assert.equal(await C.avisoDoMP('706', wa), 'pix cancelado')
  assert.ok(pixCancelados.includes('706'))
  delete extras[b.ref]
})
