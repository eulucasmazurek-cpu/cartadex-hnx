// Apagar enquetes ao encerrar e postar prévia sem enquete.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-limpeza-'))
const { db, setCfg } = await import('../src/db.js')
const F = await import('../src/fila.js')
const { opcoesDaCarta } = await import('../src/leilao.js')

const log = []
let n = 0
F._usarConexao({
  estado: { conectado: true },
  postarCarta: async c => { n++; return { fotoId: 'F' + n, enqueteId: 'E' + n, opcoes: opcoesDaCarta(c), grupo: 'g@g.us' } },
  postarPrevia: async (c, legenda) => { log.push(['previa', c.id, legenda]); return 'P' + c.id },
  apagarMensagem: async (grupo, id) => { log.push(['apagar', grupo, id]) },
  enviarTexto: async texto => { log.push(['texto', texto]) }
})
const { adicionarGrupo } = await import('../src/grupos.js')
adicionarGrupo('g@g.us', 'Grupo')

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('L', 0)").run().lastInsertRowid)
const nova = d => Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, arremate) VALUES (?, 'a.jpg', ?, 1000, 1500, 2000, 4000)`).run(lote, d).lastInsertRowid)

test('ao encerrar, apaga só a enquete (padrão)', async () => {
  const id = nova('Pikachu')
  F.enfileirar([id])
  await F.enviarProxima()
  assert.equal(db.prepare('SELECT grupo_jid FROM cartas WHERE id = ?').get(id).grupo_jid, 'g@g.us')
  log.length = 0
  await F.encerrarEAnunciar([id])
  const apagadas = log.filter(l => l[0] === 'apagar')
  assert.deepEqual(apagadas, [['apagar', 'g@g.us', 'E1']])
})

test('com a opção ligada, apaga também a foto; desligado, não apaga nada', async () => {
  setCfg('apagar_foto', '1')
  const a = nova('Mew'); F.enfileirar([a]); await F.enviarProxima()
  log.length = 0
  await F.encerrarEAnunciar([a])
  assert.deepEqual(log.filter(l => l[0] === 'apagar').map(l => l[2]).sort(), ['E2', 'F2'])

  setCfg('apagar_enquete', '0'); setCfg('apagar_foto', '0')
  const b = nova('Eevee'); F.enfileirar([b]); await F.enviarProxima()
  log.length = 0
  await F.encerrarEAnunciar([b])
  assert.equal(log.filter(l => l[0] === 'apagar').length, 0)
})

test('prévia: abertura + uma foto por carta, sem enquete', async () => {
  const x = nova('Charizard ex'); const y = nova('')
  const texto = F.textoPrevia('👀 Prévia! {n} cartas {quando}.', 2, 'hoje às 20h')
  assert.equal(texto, '👀 Prévia! 2 cartas hoje às 20h.')
  assert.equal(F.textoPrevia('{n} cartas entram {quando}.', 3, ''), '3 cartas entram.')
  log.length = 0
  const { total, pronto } = F.enviarPrevia([x, y], { texto, comValores: true })
  assert.equal(total, 2)
  assert.equal(await pronto, 2)
  assert.equal(log[0][0], 'texto')
  assert.deepEqual(log.slice(1).map(l => [l[0], l[1]]), [['previa', x], ['previa', y]])
  assert.match(log[1][2], /Charizard ex/)
  assert.match(log[1][2], /a partir de R\$ 10,00/)
  assert.match(log[1][2], /Arremate: R\$ 40,00/)
  assert.ok(db.prepare('SELECT previa_em FROM cartas WHERE id = ?').get(x).previa_em)
  assert.equal(db.prepare('SELECT status FROM cartas WHERE id = ?').get(x).status, 'pendente')
})
