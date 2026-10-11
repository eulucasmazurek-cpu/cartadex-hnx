// Teste do fluxo completo com um WhatsApp de mentira:
// cadastro -> fila -> envio -> votos chegando -> encerramento -> anúncio -> reenvio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-fluxo-'))

const { db, setCfg } = await import('../src/db.js')
const F = await import('../src/fila.js')
const { processarVotos, sha256 } = await import('../src/votos.js')

const enviados = []
let n = 0
const falso = {
  estado: { conectado: true },
  postarCarta: async c => {
    const { opcoesDaCarta } = await import('../src/leilao.js')
    n++
    enviados.push({ tipo: 'carta', id: c.id })
    return { fotoId: 'F' + n, enqueteId: 'E' + n, opcoes: opcoesDaCarta(c) }
  },
  enviarTexto: async (texto, mencoes) => { enviados.push({ tipo: 'texto', texto, mencoes }) }
}
F._usarConexao(falso)
const { adicionarGrupo } = await import('../src/grupos.js')
adicionarGrupo('grupo@g.us', 'Grupo')

const voto = (quem, textoOpcao, ts) => ({
  pollUpdateMessageKey: { participant: quem, remoteJid: 'grupo@g.us' },
  vote: { selectedOptions: textoOpcao ? [sha256(textoOpcao)] : [] },
  senderTimestampMs: ts
})

test('fluxo completo', async () => {
  const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Lote 1', 0)").run().lastInsertRowid)
  const add = (v) => Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, arremate)
    VALUES (?, 'a.jpg', 'Pikachu', ?, ?, ?, ?)`).run(lote, ...v).lastInsertRowid)
  const a = add([1000, 2000, 3000, 6000])
  const b = add([1000, 2000, 3000, 6000])
  const ruim = add([1000, 1000, 3000, 6000])

  const agora = Date.now()
  const r = F.enfileirar([a, b, ruim], { encerraEm: agora + 3600_000 }, agora)
  assert.deepEqual(r.enviadas, [a, b])
  assert.equal(r.recusadas[0].id, ruim)

  assert.equal(await F.enviarProxima(), true)
  assert.equal(await F.enviarProxima(), true)
  assert.equal(await F.enviarProxima(), false)
  assert.equal(db.prepare('SELECT status FROM cartas WHERE id = ?').get(a).status, 'no_ar')

  // Votos na carta A (enquete E1). Bia e Caio no maior valor, Bia primeiro.
  processarVotos('E1', [voto('ana@s.whatsapp.net', 'R$ 10,00', 100)])
  processarVotos('E1', [voto('caio@s.whatsapp.net', 'R$ 30,00', 300)])
  processarVotos('E1', [voto('bia:3@s.whatsapp.net', 'R$ 30,00', 200)])
  // Ninguém vota na B. Voto numa enquete desconhecida é ignorado.
  assert.equal(processarVotos('XYZ', [voto('x@s.whatsapp.net', 'R$ 10,00', 1)]), 0)

  // Passa a hora do encerramento.
  await F.verificarAgenda(agora + 3600_001)
  const ca = db.prepare('SELECT * FROM cartas WHERE id = ?').get(a)
  assert.equal(ca.status, 'vendida')
  assert.equal(ca.vencedor, 'bia@s.whatsapp.net')
  assert.equal(ca.valor_venda, 3000)
  assert.equal(db.prepare('SELECT status FROM cartas WHERE id = ?').get(b).status, 'sem_lance')

  const anuncio = enviados.find(e => e.tipo === 'texto')
  assert.match(anuncio.texto, /🎉 Parabéns, @bia!\nLevou #1 — R\$ 30,00/)
  assert.deepEqual(anuncio.mencoes, ['bia@s.whatsapp.net'])

  // Voto atrasado depois de encerrar não muda nada.
  processarVotos('E1', [voto('zé@s.whatsapp.net', '⚡ Arremate R$ 60,00', 999999)])
  assert.equal(db.prepare('SELECT vencedor FROM cartas WHERE id = ?').get(a).vencedor, 'bia@s.whatsapp.net')

  // Reenvio da B agendado para daqui 10 min.
  const re = F.enfileirar([b], { enviarEm: agora + 600_000 }, agora)
  assert.deepEqual(re.enviadas, [b])
  assert.equal(db.prepare('SELECT status FROM cartas WHERE id = ?').get(b).status, 'agendada')
  await F.verificarAgenda(agora + 600_001)
  assert.equal(db.prepare('SELECT status FROM cartas WHERE id = ?').get(b).status, 'fila')
  await F.enviarProxima()
  processarVotos('E3', [voto('dani@s.whatsapp.net', '⚡ Arremate R$ 60,00', 5)])
  await F.encerrarEAnunciar([b])
  const cb = db.prepare('SELECT * FROM cartas WHERE id = ?').get(b)
  assert.equal(cb.status, 'vendida')
  assert.equal(cb.opcao_venda, 3)
  assert.equal(cb.envios, 2)
})

test('link da loja: uma vez por hora e só no horário', async () => {
  setCfg('link_ativo', '1')
  setCfg('link_url', 'https://minhaloja.com')
  setCfg('link_hora_inicio', '8')
  setCfg('link_hora_fim', '22')
  const antes = enviados.length
  assert.equal(await F.talvezEnviarLink(new Date(2026, 9, 1, 10, 0)), true)
  assert.equal(await F.talvezEnviarLink(new Date(2026, 9, 1, 10, 30)), false)
  assert.equal(await F.talvezEnviarLink(new Date(2026, 9, 1, 11, 0)), true)
  assert.equal(await F.talvezEnviarLink(new Date(2026, 9, 1, 23, 0)), false)
  assert.equal(enviados.length, antes + 2)
  assert.match(enviados.at(-1).texto, /https:\/\/minhaloja\.com/)
})
