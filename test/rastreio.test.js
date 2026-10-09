// Rastreio: manda o código ao comprador e acompanha as atualizações (PacoteVício de mentira).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-rastreio-'))
const { db, setCfg, cfg } = await import('../src/db.js')
const R = await import('../src/rastreio.js')
R._semEsperaRastreio()

db.prepare("INSERT OR REPLACE INTO contatos VALUES ('9@lid', 'Carla Dias', '+5547933334444')").run()
const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('L', 0)").run().lastInsertRowid)
function remessa (extra = {}) {
  const id = Number(db.prepare("INSERT INTO remessas (comprador, nome, criada_em, status) VALUES ('9@lid', 'Carla', ?, 'pago')").run(Date.now()).lastInsertRowid)
  db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, status, vencedor, valor_venda, remessa_id)
    VALUES (?, 'x.jpg', 'Pikachu', 1000, 2000, 3000, 'vendida', '9@lid', 3000, ?)`).run(lote, id)
  for (const [k, v] of Object.entries(extra)) db.prepare(`UPDATE remessas SET ${k} = ? WHERE id = ?`).run(v, id)
  return id
}
const pegar = id => db.prepare('SELECT * FROM remessas WHERE id = ?').get(id)
function whats () {
  const log = []
  return { log, estado: { conectado: true }, enviarTexto: async (t, m, para) => log.push([para, t]) }
}

// Respostas no formato do PacoteVício (Correios), com vírgula sobrando como no exemplo deles.
let eventos = []
const chamadas = []
R._usarFetchRastreio(async (url, op) => {
  chamadas.push({ url, op })
  if (op.headers['X-RapidAPI-Key'] !== 'chave-de-teste-1234567890abcd') return { ok: false, status: 403, text: async () => '{}' }
  const ev = eventos.map(([d, data, cidade]) => `{"descricao":"${d}","dtHrCriado":{"date":"${data}.000000","timezone":"America/Sao_Paulo"},"unidade":{"endereco":{"cidade":"${cidade}","uf":"SC",},},}`)
  return { ok: true, status: 200, text: async () => `{"codObjeto":"AB123456789BR","eventos":[${ev.join(',')}],}` }
})

test('transportadora pelo código e classificação das movimentações', () => {
  assert.equal(R.transportadoraDe('ab 123.456.789-br'), 'correios')
  assert.equal(R.transportadoraDe('JD0001234'), 'outra')
  assert.equal(R.transportadoraDe('JD0001234', 'totalexpress'), 'totalexpress')
  assert.equal(R.classificar('Objeto postado'), 'postado')
  assert.equal(R.classificar('Objeto em transferência - por favor aguarde'), 'transito')
  assert.equal(R.classificar('Objeto saiu para entrega ao destinatário'), 'saiu')
  assert.equal(R.classificar('Objeto entregue ao destinatário'), 'entregue')
  assert.equal(R.classificar('Objeto aguardando retirada no endereço indicado'), 'retirada')
  assert.equal(R.classificar('Objeto não entregue - carteiro não atendido'), 'problema')
  assert.equal(R.linkRastreio('ab123456789br'), 'https://www.linkcorreios.com.br/?id=AB123456789BR')
})

test('salvar o código: manda ao comprador, marca Enviado e não repete', async () => {
  const wa = whats()
  const id = remessa()
  db.prepare("UPDATE remessas SET rastreio = 'ab123456789br' WHERE id = ?").run(id)
  assert.deepEqual(await R.codigoSalvo(wa, id, null), { avisou: true })
  assert.equal(pegar(id).status, 'enviado'); assert.equal(pegar(id).rastreio, 'AB123456789BR')
  assert.equal(wa.log[0][0], '5547933334444@s.whatsapp.net')
  assert.match(wa.log[0][1], /Oi, Carla!/); assert.match(wa.log[0][1], /\*AB123456789BR\*/); assert.match(wa.log[0][1], /linkcorreios/)
  assert.deepEqual(await R.codigoSalvo(wa, id, 'AB123456789BR'), { avisou: false }) // mesmo código: não manda de novo
  setCfg('rastreio_ativo', '0')
  const id2 = remessa({ rastreio: 'CD123456789BR' })
  assert.deepEqual(await R.codigoSalvo(wa, id2, null), { avisou: false })
  assert.equal(wa.log.length, 1)
  setCfg('rastreio_ativo', '1')
})

test('telefone digitado na remessa tem preferência', async () => {
  const wa = whats()
  const id = remessa({ rastreio: 'EF123456789BR', telefone: '(48) 98888-7777' })
  await R.mandarCodigo(wa, id)
  assert.equal(wa.log[0][0], '5548988887777@s.whatsapp.net')
})

test('acompanha: avisa a cada etapa, marca entregue e para de consultar', async () => {
  setCfg('rastreio_chave', 'chave-de-teste-1234567890abcd')
  const wa = whats()
  const id = remessa({ rastreio: 'GH123456789BR', status: 'enviado' })
  const agora = Date.now()
  eventos = [['Objeto postado', '2026-10-08 10:00:00', 'Joinville']]
  let r = await R.conferir(wa, id, agora)
  assert.deepEqual([r.novas, r.marco, r.avisou], [1, 'postado', true])
  assert.match(wa.log[0][1], /\*Objeto postado\* · Joinville\/SC/)
  assert.match(chamadas.at(-1).url, /api\.pacotevicio\.dev\/correios\?tracking_code=GH123456789BR/)

  r = await R.conferir(wa, id, agora) // nada novo
  assert.equal(r.novas, 0); assert.equal(wa.log.length, 1)

  eventos = [['Objeto em transferência - por favor aguarde', '2026-10-09 08:00:00', 'Curitiba'], ...eventos]
  r = await R.conferir(wa, id, agora); assert.equal(r.marco, 'transito'); assert.equal(wa.log.length, 2)
  eventos = [['Objeto em transferência - por favor aguarde', '2026-10-10 08:00:00', 'Florianópolis'], ...eventos]
  r = await R.conferir(wa, id, agora); assert.equal(r.avisou, false) // mesma etapa: não incomoda
  eventos = [['Objeto entregue ao destinatário', '2026-10-11 15:00:00', 'Florianópolis'], ...eventos]
  r = await R.conferir(wa, id, agora); assert.equal(r.marco, 'entregue')
  assert.equal(pegar(id).status, 'entregue'); assert.match(pegar(id).rastreio_ultimo, /entregue/)
  assert.ok(!R.paraConferir(agora + 30 * 86400_000).some(x => x.id === id))
})

test('intervalo, transportadora sem leitura e limite do mês', async () => {
  const agora = Date.now()
  const a = remessa({ rastreio: 'IJ123456789BR', status: 'enviado', rastreio_conferido: agora - 3600_000 })
  const b = remessa({ rastreio: 'JADLOG12345', status: 'enviado' })
  setCfg('rastreio_horas', '6')
  let lista = R.paraConferir(agora).map(x => x.id)
  assert.ok(!lista.includes(a)) // conferida há 1 h
  assert.ok(!lista.includes(b)) // sem leitura automática
  lista = R.paraConferir(agora + 6 * 3600_000).map(x => x.id)
  assert.ok(lista.includes(a))
  setCfg('rastreio_limite', String(R.usoDoMes()))
  await assert.rejects(R.conferir(whats(), a), /limite/)
  assert.match(pegar(a).rastreio_erro, /limite/)
  setCfg('rastreio_limite', '950')
})

test('chave errada vira mensagem clara', async () => {
  setCfg('rastreio_chave', 'chave-errada-000000000000000')
  const id = remessa({ rastreio: 'KL123456789BR', status: 'enviado' })
  await assert.rejects(R.conferir(whats(), id), /chave do PacoteVício é inválida/)
})

test('"entregue ao remetente" é problema, não entrega', () => {
  assert.equal(R.classificar('Objeto entregue ao remetente'), 'problema')
  assert.equal(R.classificar('Objeto devolvido ao remetente'), 'problema')
  assert.equal(R.classificar('Objeto entregue ao destinatário'), 'entregue')
})

test('código sem nenhuma movimentação: para de consultar sozinho depois de algumas vezes', async () => {
  setCfg('rastreio_chave', 'chave-de-teste-1234567890abcd')
  eventos = []
  const id = remessa({ rastreio: 'XX999999999BR', status: 'enviado' })
  let t = Date.now()
  for (let i = 0; i < R.MAX_VAZIAS; i++) { await R.conferir(whats(), id, t); t += 7 * 3600_000 }
  assert.match(pegar(id).rastreio_erro, /confira se o código está certo/)
  assert.ok(!R.paraConferir(t).some(r => r.id === id))
  // Apareceu movimentação (conferência manual): volta ao normal.
  eventos = [['Objeto postado', '2026-10-01 10:00:00', 'Blumenau']]
  await R.conferir(whats(), id, t)
  assert.equal(pegar(id).rastreio_erro, null)
  assert.equal(pegar(id).rastreio_vazias, 0)
})
