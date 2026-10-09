// Mural das cartas ganhas (precisa do ImageMagick; sem ele o teste é pulado).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-mural-'))
const { db, setCfg, PASTA_FOTOS } = await import('../src/db.js')
const M = await import('../src/mural.js')
const G = await import('../src/ganhador.js')
G._semEspera()
const temIM = await M.temMural()

fs.mkdirSync(PASTA_FOTOS, { recursive: true })
const cores = ['red', 'blue', 'green', 'orange', 'purple']
if (temIM) cores.forEach((c, i) => execFileSync('convert', ['-size', '300x420', `xc:${c}`, path.join(PASTA_FOTOS, `m${i}.jpg`)]))
const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('L', 0)").run().lastInsertRowid)
const vendida = (foto, valor) => {
  const id = Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, status, vencedor, valor_venda, encerrada_em)
    VALUES (?, ?, 'Carta', 1000, 2000, 3000, 'vendida', '5@lid', ?, ?)`).run(lote, foto, valor, Date.now()).lastInsertRowid)
  return db.prepare('SELECT * FROM cartas WHERE id = ?').get(id)
}

test('colunas da grade', () => {
  assert.deepEqual([1, 2, 4, 5, 9, 10, 16].map(M.colunasDoMural), [1, 2, 2, 3, 3, 4, 4])
})

test('monta uma imagem só com todas as cartas', { skip: !temIM && 'sem ImageMagick' }, async () => {
  const cartas = [0, 1, 2, 3, 4].map(i => vendida(`m${i}.jpg`, 1000 * (i + 1)))
  const arq = await M.montarMural(cartas)
  assert.ok(arq && fs.existsSync(arq))
  const [w, h] = execFileSync('identify', ['-format', '%w %h', arq]).toString().split(' ').map(Number)
  assert.ok(w > 1000 && h > 800, `${w}x${h}`) // 3 colunas x 2 linhas
  assert.equal(await M.montarMural(cartas.slice(0, 1)), null) // uma carta: sem mural
})

test('no aviso do ganhador: mural + mensagem; ou uma foto por carta', { skip: !temIM && 'sem ImageMagick' }, async () => {
  setCfg('ganhador_ativo', '1')
  const log = []
  const wa = { estado: { conectado: true }, enviarFoto: async (c, l) => log.push(['foto', path.basename(c), l]), enviarTexto: async t => log.push(['texto', t]) }
  const cs = [vendida('m0.jpg', 1000), vendida('m1.jpg', 2000), vendida('m2.jpg', 3000)]
  await G.avisarGanhadores(wa, cs.map(c => ({ carta: c, vencedor: { votante: '5@lid' } })))
  assert.deepEqual(log.map(l => l[0]), ['foto', 'texto'])
  assert.match(log[0][1], /^mural-/); assert.match(log[0][2], /Suas cartas: #\d+, #\d+, #\d+/)

  setCfg('ganhador_fotos', 'separadas')
  log.length = 0
  const ds = [vendida('m3.jpg', 1000), vendida('m4.jpg', 2000)]
  await G.avisarGanhadores(wa, ds.map(c => ({ carta: c, vencedor: { votante: '5@lid' } })))
  assert.deepEqual(log.map(l => l[0]), ['foto', 'foto', 'texto'])
  setCfg('ganhador_fotos', 'mural')
})
