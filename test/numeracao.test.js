// Cada lote tem a sua numeração, começando no #1.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-num-'))
const { db } = await import('../src/db.js')
const L = await import('../src/leilao.js')

const novoLote = nome => Number(db.prepare('INSERT INTO lotes (nome, criado_em) VALUES (?, 0)').run(nome).lastInsertRowid)
const novaCarta = lote => Number(db.prepare("INSERT INTO cartas (lote_id, foto) VALUES (?, 'x.jpg')").run(lote).lastInsertRowid)
const numero = id => db.prepare('SELECT numero FROM cartas WHERE id = ?').get(id).numero

test('lotes diferentes começam cada um no #1', () => {
  const a = novoLote('Lote 1'); const b = novoLote('Lote 2')
  const a1 = novaCarta(a); const a2 = novaCarta(a); const b1 = novaCarta(b); const a3 = novaCarta(a); const b2 = novaCarta(b)
  assert.deepEqual([numero(a1), numero(a2), numero(a3)], [1, 2, 3])
  assert.deepEqual([numero(b1), numero(b2)], [1, 2])
})

test('apagar o lote e criar outro com o mesmo nome recomeça do #1', () => {
  const x = novoLote('Escarlate')
  novaCarta(x); novaCarta(x); novaCarta(x)
  db.prepare('DELETE FROM lotes WHERE id = ?').run(x)
  const y = novoLote('Escarlate')
  assert.equal(numero(novaCarta(y)), 1)
  assert.equal(numero(novaCarta(y)), 2)
})

test('textos do WhatsApp usam o número do lote', () => {
  const l = novoLote('Lote Teste')
  const id = novaCarta(l); const id2 = novaCarta(l)
  const c = db.prepare('SELECT * FROM cartas WHERE id = ?').get(id2)
  assert.equal(L.tituloEnquete({ ...c, descricao: 'Mew\nHolo, NM' }), '🃏 Lote Teste, carta #2\nMew\nHolo, NM')
  assert.equal(L.tituloEnquete({ ...c, descricao: '' }), '🃏 Lote Teste, carta #2')
  const longo = L.tituloEnquete({ ...c, descricao: 'x'.repeat(400) })
  assert.equal([...longo].length, L.LIMITE_TITULO)
  assert.ok(longo.endsWith('...'))
  const { texto } = L.textoResultado([
    { carta: db.prepare('SELECT * FROM cartas WHERE id = ?').get(id), vencedor: { votante: 'ana@s.whatsapp.net', valor: 1000, tipo: 'lance' } },
    { carta: c, vencedor: null }
  ])
  assert.match(texto, /\*Lote Teste\*/)
  assert.match(texto, /🎉 Parabéns, @ana!\nLevou #1 — R\$ 10,00/)
  assert.doesNotMatch(texto, /chamem no privado/)
  assert.match(texto, /Sem lance: #2/)
})
