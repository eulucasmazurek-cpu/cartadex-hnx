// Segunda varredura de falhas: votos atrasados/fora de ordem, fila atrasada, anúncio que não saiu,
// divulgação presa, envio duplo e horário automático que falhou.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-falhas2-'))
const { db, setCfg, cfg } = await import('../src/db.js')
const F = await import('../src/fila.js')
const L = await import('../src/leilao.js')
const G = await import('../src/grupos.js')
const D = await import('../src/divulgacao.js')
const { processarVotos, sha256 } = await import('../src/votos.js')

const GR = 'g1@g.us'
G.adicionarGrupo(GR, 'Grupo 1')
const log = []
let n = 0
let incerto = false
const wa = {
  estado: { conectado: true },
  postarCarta: async (c, grupo) => {
    n++
    if (incerto) { const e = new Error('Tempo esgotado ao enviar a enquete (60s)'); e.incerto = true; e.fotoId = 'F' + n; e.enqueteId = 'E' + n; throw e }
    log.push(['carta', c.id, grupo])
    return { fotoId: 'F' + n, enqueteId: 'E' + n }
  },
  enviarTexto: async (texto, m, grupo) => { log.push(['texto', grupo, texto]) },
  apagarMensagem: async () => {}
}
F._usarConexao(wa)

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Lote', 0)").run().lastInsertRowid)
const nova = () => Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, arremate)
  VALUES (?, 'a.jpg', 'Mew', 1000, 2000, 3000, 6000)`).run(lote).lastInsertRowid)
const carta = id => db.prepare('SELECT * FROM cartas WHERE id = ?').get(id)
const voto = (quem, txt, ts) => ({ pollUpdateMessageKey: { participant: quem, remoteJid: GR }, vote: { selectedOptions: txt ? [sha256(txt)] : [] }, senderTimestampMs: ts })

async function noAr (encerraEm = Date.now() + 3600_000) {
  const id = nova()
  F.enfileirar([id], { encerraEm })
  assert.equal(await F.enviarProxima(), true)
  return { id, enquete: carta(id).enquete_msg_id }
}

test('voto feito depois da hora de encerrar não vale', async () => {
  const { id, enquete } = await noAr()
  const fim = Date.now() - 1000
  db.prepare('UPDATE cartas SET encerra_em = ? WHERE id = ?').run(fim, id)
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 10,00', fim - 5000)])
  processarVotos(enquete, [voto('bia@s.whatsapp.net', '⚡ Arremate R$ 60,00', fim + 500)])
  const [r] = L.encerrarCartas([id])
  assert.equal(r.vencedor.votante, 'ana@s.whatsapp.net')
})

test('voto atrasado (mais antigo que o último) não desfaz a mudança', async () => {
  const { id, enquete } = await noAr()
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 30,00', 2000)])
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 10,00', 1000)]) // chegou depois, mas é de antes
  assert.equal(db.prepare('SELECT opcao FROM votos WHERE carta_id = ?').get(id).opcao, 2)
  processarVotos(enquete, [voto('ana@s.whatsapp.net', null, 3000)]) // retirou
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 20,00', 2500)]) // atrasado: não volta
  assert.equal(db.prepare('SELECT COUNT(*) n FROM votos WHERE carta_id = ?').get(id).n, 0)
})

test('voto que não bate com nenhuma opção é ignorado (não apaga o lance)', async () => {
  const { id, enquete } = await noAr()
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 30,00', 1000)])
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 99,00', 2000)])
  assert.equal(db.prepare('SELECT opcao FROM votos WHERE carta_id = ?').get(id).opcao, 2)
})

test('carta que volta para a fila perde as opções antigas', async () => {
  const { id } = await noAr()
  L.encerrarCartas([id])
  assert.ok(carta(id).opcoes)
  F.enfileirar([id], {})
  assert.equal(carta(id).opcoes, null)
  await F.enviarProxima()
})

test('fila atrasada: carta que entraria no ar já encerrada ganha 10 minutos', async () => {
  const id = nova()
  F.enfileirar([id], { encerraEm: Date.now() + 5000 })
  db.prepare('UPDATE cartas SET encerra_em = ? WHERE id = ?').run(Date.now() - 60_000, id)
  await F.enviarProxima()
  const c = carta(id)
  assert.equal(c.status, 'no_ar')
  assert.ok(c.encerra_em > Date.now() + 9 * 60_000)
  assert.match(c.erro, /fila atrasou/)
})

test('enquete que demorou a confirmar conta como postada (não sai duas vezes)', async () => {
  const id = nova()
  F.enfileirar([id], {})
  incerto = true
  assert.equal(await F.enviarProxima(), true)
  incerto = false
  const c = carta(id)
  assert.equal(c.status, 'no_ar')
  assert.ok(c.enquete_msg_id)
  assert.match(c.erro, /demorou para confirmar/)
  assert.equal(await F.enviarProxima(), false)
})

test('resultado com o WhatsApp fora do ar sai quando a conexão volta', async () => {
  setCfg('anunciar_resultado', '1')
  const { id, enquete } = await noAr()
  processarVotos(enquete, [voto('ana@s.whatsapp.net', 'R$ 20,00', Date.now())])
  wa.estado.conectado = false
  await F.encerrarEAnunciar([id])
  assert.equal(log.filter(l => l[0] === 'texto').length, 0)
  wa.estado.conectado = true
  assert.equal(await F.anunciarPendentes(), 1)
  const t = log.filter(l => l[0] === 'texto').at(-1)
  assert.equal(t[1], GR); assert.match(t[2], /Leilão encerrado/); assert.match(t[2], /R\$ 20,00/)
  assert.equal(await F.anunciarPendentes(), 0)
})

test('divulgação presa em "enviando" depois de reiniciar é destravada', () => {
  const agora = Date.now()
  const ins = (repetir) => Number(db.prepare(`INSERT INTO divulgacoes (texto, destino, proximo_em, repetir, status, criada_por, criada_em)
    VALUES ('oi', NULL, ?, ?, 'enviando', 'teste', ?)`).run(agora - 3600_000, repetir, agora).lastInsertRowid)
  const a = ins(''); const b = ins('diario')
  assert.equal(F.destravarDivulgacoes(agora), 2)
  assert.equal(D.pegarDivulgacao(a).status, 'erro')
  assert.equal(D.pegarDivulgacao(b).status, 'agendada')
  assert.ok(D.pegarDivulgacao(b).proximo_em > agora)
})

test('"Enviar agora" de uma que repete trava contra envio duplo', async () => {
  const agora = Date.now()
  const id = Number(db.prepare(`INSERT INTO divulgacoes (texto, destino, proximo_em, repetir, status, criada_por, criada_em)
    VALUES ('promo', NULL, ?, 'diario', 'agendada', 'teste', ?)`).run(agora - 1000, agora).lastInsertRowid)
  const antes = log.length
  const [x, y] = await Promise.all([F.enviarDivulgacaoAgora(id), F.enviarDivulgacoes(agora)])
  void x; void y
  assert.equal(log.slice(antes).filter(l => l[2] === 'promo').length, 1)
  assert.equal(D.pegarDivulgacao(id).status, 'agendada')
})

test('horário automático: grupo que falhou é tentado de novo (só ele)', async () => {
  const H = 'h@g.us'; const K = 'k@g.us'
  G.adicionarGrupo(H, 'H'); G.adicionarGrupo(K, 'K')
  const est = { [GR]: { fechado: false, souAdmin: true }, [H]: { fechado: false, souAdmin: true }, [K]: { fechado: false, souAdmin: true } }
  let falharK = true
  const mudou = []
  F._usarConexao({
    ...wa,
    listarGrupos: async () => Object.entries(est).map(([id, e]) => ({ id, ...e })),
    fecharGrupo: async (jid, fechar) => { if (jid === K && falharK) throw new Error('Timed Out'); est[jid].fechado = fechar; mudou.push(jid) }
  })
  setCfg('horario_ativo', '1'); setCfg('horario_fechar', '23:00'); setCfg('horario_abrir', '08:00')
  const t = new Date(2026, 9, 10, 23, 5).getTime()
  const r1 = await F.aplicarHorarioGrupos(t)
  assert.ok(r1.feitos.includes(H)); assert.deepEqual(r1.repetir, [K])
  falharK = false
  const r2 = await F.aplicarHorarioGrupos(t + 20_000)
  assert.deepEqual(r2.feitos, [K])
  assert.equal(await F.aplicarHorarioGrupos(t + 40_000), null) // tudo certo: não mexe mais
  assert.equal(mudou.filter(j => j === H).length, 1)
  assert.equal(cfg('horario_pendente'), '')
  F._usarConexao(wa)
})
