// Vários grupos: envio para todos ou só alguns, pausa, votos de grupos diferentes, resultado por grupo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-grupos-'))
const { db, setCfg } = await import('../src/db.js')
const F = await import('../src/fila.js')
const G = await import('../src/grupos.js')
const { processarVotos, sha256 } = await import('../src/votos.js')

const log = []
let n = 0
F._usarConexao({
  estado: { conectado: true },
  postarCarta: async (c, grupo) => { n++; log.push(['carta', c.id, grupo]); return { fotoId: 'F' + n, enqueteId: 'E' + n } },
  postarPrevia: async (c, legenda, grupo) => { log.push(['previa', c.id, grupo]) },
  apagarMensagem: async (grupo, id) => { log.push(['apagar', grupo, id]) },
  enviarTexto: async (texto, mencoes, grupo) => { log.push(['texto', grupo, texto, mencoes]) }
})

const A = 'a@g.us'; const B = 'b@g.us'; const C = 'c@g.us'
G.adicionarGrupo(A, 'Grupo A'); G.adicionarGrupo(B, 'Grupo B'); G.adicionarGrupo(C, 'Grupo C')

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Lote 1', 0)").run().lastInsertRowid)
const nova = () => Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, arremate) VALUES (?, 'a.jpg', 'Mew', 1000, 2000, 3000, 6000)`).run(lote).lastInsertRowid)
const voto = (quem, opcao, ts) => ({ pollUpdateMessageKey: { participant: quem }, vote: { selectedOptions: [sha256(opcao)] }, senderTimestampMs: ts })
const status = id => db.prepare('SELECT status FROM cartas WHERE id = ?').get(id).status

test('escolha de grupos no formulário', () => {
  assert.deepEqual(G.lerDestino(undefined), { destino: null, erro: '' })
  assert.deepEqual(G.lerDestino(['-', A, B, C]), { destino: null, erro: '' }) // todos os ativos
  assert.deepEqual(G.lerDestino(['-', A]), { destino: JSON.stringify([A]), erro: '' })
  assert.match(G.lerDestino(['-']).erro, /pelo menos um grupo/)
  assert.match(G.lerDestino(['-', 'x@g.us']).erro, /pelo menos um grupo/)
})

test('carta vai para todos os grupos ativos; pausado fica de fora', async () => {
  G.pausarGrupo(C, true)
  const id = nova()
  F.enfileirar([id], { encerraEm: Date.now() + 3600_000 })
  assert.equal(await F.enviarProxima(), true)
  assert.deepEqual(log.filter(l => l[0] === 'carta').map(l => l[2]), [A, B])
  assert.equal(status(id), 'no_ar')
  assert.deepEqual(G.postagensDa(id).map(p => [p.grupo_jid, p.enquete_msg_id]), [[A, 'E1'], [B, 'E2']])

  // Votos nas duas enquetes valem para a mesma carta. Empate no maior valor: quem votou primeiro.
  processarVotos('E1', [voto('ana@s.whatsapp.net', 'R$ 30,00', 200)])
  processarVotos('E2', [voto('bia@s.whatsapp.net', 'R$ 30,00', 100)])
  processarVotos('E2', [voto('caio@s.whatsapp.net', 'R$ 10,00', 50)])
  log.length = 0
  const [r] = await F.encerrarEAnunciar([id])
  assert.equal(r.vencedor.votante, 'bia@s.whatsapp.net')

  // O resultado sai nos dois grupos, e as duas enquetes são apagadas.
  const textos = log.filter(l => l[0] === 'texto')
  assert.deepEqual(textos.map(l => l[1]).sort(), [A, B])
  assert.match(textos[0][2], /#1: @bia — R\$ 30,00/)
  assert.deepEqual(log.filter(l => l[0] === 'apagar').map(l => [l[1], l[2]]).sort(), [[A, 'E1'], [B, 'E2']])
})

test('carta só para um grupo; resultado só nele', async () => {
  log.length = 0
  const so = nova()
  F.enfileirar([so], { destino: JSON.stringify([B]) })
  await F.enviarProxima()
  assert.deepEqual(log.filter(l => l[0] === 'carta').map(l => l[2]), [B])
  log.length = 0
  await F.encerrarEAnunciar([so])
  assert.deepEqual(log.filter(l => l[0] === 'texto').map(l => l[1]), [B])
})

test('carta de grupo pausado espera sem travar as outras', async () => {
  log.length = 0
  const presa = nova(); const livre = nova()
  F.enfileirar([presa], { destino: JSON.stringify([C]) }) // C está pausado
  F.enfileirar([livre], { destino: JSON.stringify([A]) })
  assert.equal(await F.enviarProxima(), true)
  assert.deepEqual(log.filter(l => l[0] === 'carta').map(l => [l[1], l[2]]), [[livre, A]])
  assert.equal(status(presa), 'fila')
  assert.match(db.prepare('SELECT erro FROM cartas WHERE id = ?').get(presa).erro, /pausados/)
  assert.equal(await F.enviarProxima(), false)

  // Retomou o grupo: a carta sai.
  G.pausarGrupo(C, false)
  assert.equal(await F.enviarProxima(), true)
  assert.equal(status(presa), 'no_ar')
  assert.equal(db.prepare('SELECT erro FROM cartas WHERE id = ?').get(presa).erro, null)
})

test('se um grupo falha, a carta sai nos outros e avisa', async () => {
  log.length = 0
  const id = nova()
  F._usarConexao({
    estado: { conectado: true },
    postarCarta: async (c, grupo) => {
      if (grupo === B) throw new Error('not-authorized')
      n++; log.push(['carta', c.id, grupo]); return { fotoId: 'F' + n, enqueteId: 'E' + n }
    },
    enviarTexto: async () => {},
    apagarMensagem: async () => {}
  })
  F.enfileirar([id])
  assert.equal(await F.enviarProxima(), true)
  assert.equal(status(id), 'no_ar')
  assert.deepEqual(G.postagensDa(id).map(p => p.grupo_jid).sort(), [A, C])
  assert.match(db.prepare('SELECT erro FROM cartas WHERE id = ?').get(id).erro, /Grupo B: not-authorized/)
})

test('link da loja e prévia vão para os grupos certos', async () => {
  F._usarConexao({
    estado: { conectado: true },
    postarPrevia: async (c, legenda, grupo) => { log.push(['previa', c.id, grupo]) },
    enviarTexto: async (texto, mencoes, grupo) => { log.push(['texto', grupo, texto]) }
  })
  G.pausarGrupo(A, true)
  setCfg('link_ativo', '1'); setCfg('link_url', 'https://loja.com'); setCfg('link_hora_inicio', '0'); setCfg('link_hora_fim', '24')
  log.length = 0
  assert.equal(await F.talvezEnviarLink(new Date(2026, 9, 1, 10, 0)), true)
  assert.deepEqual(log.map(l => l[1]).sort(), [B, C])

  log.length = 0
  const x = nova()
  const { grupos, pronto } = F.enviarPrevia([x], { texto: 'Prévia!', grupos: [C] })
  assert.equal(grupos, 1)
  await pronto
  assert.deepEqual(log.map(l => [l[0], l[1]]), [['texto', C], ['previa', x]])
})

test('remover grupo', () => {
  assert.equal(G.removerGrupo(C), 1)
  assert.deepEqual(G.listarGruposDoBot().map(g => g.jid).sort(), [A, B])
})
