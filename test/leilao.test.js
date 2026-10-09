// Testes da apuração. Rode com:  npm run teste
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-teste-'))
process.env.PASTA_DADOS = pasta

const { db } = await import('../src/db.js')
const L = await import('../src/leilao.js')

test('lê valores em formato brasileiro', () => {
  assert.equal(L.lerValor('50'), 5000)
  assert.equal(L.lerValor('50,5'), 5050)
  assert.equal(L.lerValor('1.200,50'), 120050)
  assert.equal(L.lerValor('R$ 75'), 7500)
  assert.equal(L.lerValor(''), null)
  assert.equal(L.lerValor('abc'), null)
  assert.equal(L.moeda(120050), 'R$ 1.200,50')
})

test('valida a carta antes de enviar', () => {
  assert.deepEqual(L.problemasDaCarta({ v1: 1000, v2: 2000, v3: 3000, arremate: 5000 }), [])
  assert.ok(L.problemasDaCarta({ v1: 1000, v2: 1000, v3: 3000, arremate: 5000 }).length)
  assert.ok(L.problemasDaCarta({ v1: 1000, v2: 2000, v3: 3000, arremate: 3000 }).length)
  assert.ok(L.problemasDaCarta({ v1: 1000, v2: null, v3: 3000, arremate: 5000 }).length)
})

const ops = L.opcoesDaCarta({ v1: 3000, v2: 1000, v3: 2000, arremate: 5000 })

test('opções em ordem crescente com arremate por último', () => {
  assert.deepEqual(ops.map(o => o.valor), [1000, 2000, 3000, 5000])
  assert.equal(ops[3].tipo, 'arremate')
})

test('vence o maior valor votado', () => {
  const v = L.calcularVencedor([
    { votante: 'a', opcao: 0, ts: 1 },
    { votante: 'b', opcao: 2, ts: 5 },
    { votante: 'c', opcao: 1, ts: 2 }
  ], ops)
  assert.equal(v.votante, 'b')
  assert.equal(v.valor, 3000)
})

test('empate no valor mais alto: vence quem votou primeiro', () => {
  const v = L.calcularVencedor([
    { votante: 'tarde', opcao: 2, ts: 900 },
    { votante: 'cedo', opcao: 2, ts: 100 },
    { votante: 'x', opcao: 1, ts: 50 }
  ], ops)
  assert.equal(v.votante, 'cedo')
})

test('arremate vence qualquer lance; empate no arremate vale o primeiro', () => {
  const v = L.calcularVencedor([
    { votante: 'lance', opcao: 2, ts: 1 },
    { votante: 'arr2', opcao: 3, ts: 30 },
    { votante: 'arr1', opcao: 3, ts: 20 }
  ], ops)
  assert.equal(v.votante, 'arr1')
  assert.equal(v.tipo, 'arremate')
})

test('sem votos, sem vencedor', () => {
  assert.equal(L.calcularVencedor([], ops), null)
})

test('encerramento no banco: vendida, sem lance e troca de voto', () => {
  const lote = db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Teste', 0)").run().lastInsertRowid
  const nova = () => db.prepare(`INSERT INTO cartas (lote_id, foto, v1, v2, v3, arremate, status, opcoes)
    VALUES (?, 'x.jpg', 1000, 2000, 3000, 5000, 'no_ar', ?)`).run(lote, JSON.stringify(ops)).lastInsertRowid
  const c1 = Number(nova())
  const c2 = Number(nova())

  L.registrarVoto(c1, 'ana', 2, 100)
  L.registrarVoto(c1, 'bia', 2, 200)
  L.registrarVoto(c1, 'ana', 1, 300) // ana trocou para um valor menor
  L.registrarVoto(c1, 'bia', 2, 999) // bia votou de novo no mesmo: mantém horário 200
  L.registrarVoto(c2, 'caio', 0, 10)
  L.registrarVoto(c2, 'caio', null, 20) // caio tirou o voto

  const res = L.encerrarCartas([c1, c2])
  assert.equal(res.length, 2)
  const r1 = db.prepare('SELECT * FROM cartas WHERE id = ?').get(c1)
  assert.equal(r1.status, 'vendida')
  assert.equal(r1.vencedor, 'bia')
  assert.equal(r1.valor_venda, 3000)
  assert.equal(db.prepare('SELECT status FROM cartas WHERE id = ?').get(c2).status, 'sem_lance')

  const { texto, mencoes } = L.textoResultado(res)
  assert.match(texto, /@bia/)
  assert.deepEqual(mencoes, ['bia'])
  assert.equal(L.encerrarCartas([c1]).length, 0) // já encerrada
})
