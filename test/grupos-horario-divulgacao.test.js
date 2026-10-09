// Fechar/abrir grupos (manual e no horário) e divulgação (agora, agendada, repetindo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-hd-'))
const { db, setCfg, cfg, PASTA_FOTOS } = await import('../src/db.js')
const F = await import('../src/fila.js')
const G = await import('../src/grupos.js')
const D = await import('../src/divulgacao.js')

const A = 'a@g.us'; const B = 'b@g.us'; const C = 'c@g.us'
G.adicionarGrupo(A, 'Grupo A'); G.adicionarGrupo(B, 'Grupo B'); G.adicionarGrupo(C, 'Grupo C')

// WhatsApp de mentira: A e B têm o bot como admin; C não.
const estado = { [A]: { fechado: false, souAdmin: true }, [B]: { fechado: true, souAdmin: true }, [C]: { fechado: false, souAdmin: false } }
const log = []
let quedaUmaVez = false
const wa = {
  estado: { conectado: true },
  listarGrupos: async () => Object.entries(estado).map(([id, e]) => ({ id, nome: id, membros: 5, ...e })),
  fecharGrupo: async (jid, fechar) => {
    if (!estado[jid].souAdmin) throw new Error('o bot precisa ser administrador do grupo')
    estado[jid].fechado = fechar; log.push([fechar ? 'fechou' : 'abriu', jid])
  },
  enviarTexto: async (texto, mencoes, grupo) => {
    if (quedaUmaVez) { quedaUmaVez = false; throw new Error('WhatsApp desconectado') }
    log.push(['texto', grupo, texto])
  },
  enviarFoto: async (caminho, legenda, grupo) => { log.push(['foto', grupo, path.basename(caminho), legenda]) }
}
F._usarConexao(wa)
const dia = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime()

test('qual foi o último fechar/abrir que já passou', () => {
  const ev = (t, f = '23:00', a = '08:00') => { const e = G.eventoDoHorario(t, f, a); return e && [e.tipo, new Date(e.quando).getDate(), new Date(e.quando).getHours()] }
  assert.deepEqual(ev(dia(10, 10)), ['abrir', 10, 8])
  assert.deepEqual(ev(dia(10, 23, 30)), ['fechar', 10, 23])
  assert.deepEqual(ev(dia(11, 2)), ['fechar', 10, 23]) // madrugada: ainda vale o fechar de ontem
  assert.deepEqual(ev(dia(11, 7, 59)), ['fechar', 10, 23])
  assert.deepEqual(ev(dia(10, 13, 30), '13:00', '14:00'), ['fechar', 10, 13]) // janela no meio do dia
  assert.deepEqual(ev(dia(10, 15), '13:00', '14:00'), ['abrir', 10, 14])
  assert.equal(G.eventoDoHorario(dia(10, 10), '08:00', '08:00'), null)
  assert.equal(G.eventoDoHorario(dia(10, 10), 'xx', '08:00'), null)
})

test('horário automático: fecha uma vez, pula quem já está certo e quem não é admin', async () => {
  setCfg('horario_ativo', '1'); setCfg('horario_fechar', '23:00'); setCfg('horario_abrir', '08:00')
  setCfg('horario_msg_fechar', 'Fechado! Volta às {abre}')
  log.length = 0
  const r = await F.aplicarHorarioGrupos(dia(10, 23, 1))
  assert.deepEqual(r.feitos, [A]) // B já estava fechado
  assert.match(r.falhas[0], /Grupo C: o bot não é administrador/)
  assert.deepEqual(log, [['fechou', A], ['texto', A, 'Fechado! Volta às 08:00']])
  assert.equal(await F.aplicarHorarioGrupos(dia(10, 23, 30)), null, 'não repete o mesmo fechar')
  assert.match(db.prepare("SELECT texto FROM atividade WHERE usuario = 'CartaDex' ORDER BY id LIMIT 1").get().texto, /Fechou 1 grupo/)
})

test('horário automático: abre de manhã e respeita mudança manual depois', async () => {
  log.length = 0
  const r = await F.aplicarHorarioGrupos(dia(11, 8, 0))
  assert.deepEqual(r.feitos.sort(), [A, B])
  assert.ok(log.some(l => l[0] === 'texto' && l[2].includes('Grupo aberto')))
  // Alguém fecha o A na mão às 9h: o horário não reabre.
  await F.mudarGrupos([A], true)
  assert.equal(estado[A].fechado, true)
  assert.equal(await F.aplicarHorarioGrupos(dia(11, 9, 0)), null)
  assert.equal(estado[A].fechado, true)
  // Sem horário ligado, nada acontece.
  setCfg('horario_ativo', '0')
  assert.equal(await F.aplicarHorarioGrupos(dia(11, 23, 5)), null)
})

test('fechar à mão um grupo em que o bot não é admin avisa o motivo', async () => {
  const r = await F.mudarGrupos([C], true)
  assert.deepEqual(r.feitos, [])
  assert.match(r.falhas[0], /precisa ser administrador/)
})

test('divulgação agora: vai para todos os grupos ativos, uma vez só', async () => {
  for (const g of [A, B, C]) estado[g].fechado = false
  G.pausarGrupo(C, true)
  log.length = 0
  const agora = dia(12, 10)
  const id = D.criarDivulgacao({ texto: '🔥 Leilão hoje às 20h!', autor: 'Lucas' }, agora)
  // Duas voltas do agendador ao mesmo tempo: só uma envia.
  const [n1, n2] = await Promise.all([F.enviarDivulgacoes(agora), F.enviarDivulgacoes(agora)])
  assert.equal(n1 + n2, 1)
  assert.deepEqual(log.map(l => l.slice(0, 2)), [['texto', A], ['texto', B]])
  const d = D.pegarDivulgacao(id)
  assert.equal(d.status, 'enviada'); assert.equal(d.envios, 1); assert.equal(d.proximo_em, null)
  assert.equal(await F.enviarDivulgacoes(agora + 60_000), 0)
})

test('divulgação com foto, só para um grupo, agendada', async () => {
  fs.writeFileSync(path.join(PASTA_FOTOS, 'banner.jpg'), 'x')
  log.length = 0
  const agora = dia(12, 10)
  const id = D.criarDivulgacao({ texto: 'Cartas novas!', foto: 'banner.jpg', destino: JSON.stringify([B]), quando: dia(12, 18) }, agora)
  assert.equal(await F.enviarDivulgacoes(dia(12, 17, 59)), 0)
  assert.equal(await F.enviarDivulgacoes(dia(12, 18)), 1)
  assert.deepEqual(log, [['foto', B, 'banner.jpg', 'Cartas novas!']])
  assert.equal(D.pegarDivulgacao(id).status, 'enviada')
})

test('divulgação todo dia: anda um dia, pula os dias com o bot desligado', async () => {
  log.length = 0
  const id = D.criarDivulgacao({ texto: 'Bom dia!', repetir: 'diario', quando: dia(13, 9) }, dia(12, 10))
  await F.enviarDivulgacoes(dia(13, 9, 0))
  let d = D.pegarDivulgacao(id)
  assert.equal(d.status, 'agendada'); assert.equal(d.proximo_em, dia(14, 9)); assert.equal(d.envios, 1)
  // Bot desligado 3 dias: manda uma vez e marca a próxima para o dia seguinte.
  log.length = 0
  await F.enviarDivulgacoes(dia(17, 15))
  d = D.pegarDivulgacao(id)
  assert.equal(log.filter(l => l[0] === 'texto').length, 2) // 1 vez em cada grupo ativo
  assert.equal(d.proximo_em, dia(18, 9))
  // Enviar agora (manual) não muda a agenda.
  await F.enviarDivulgacaoAgora(id)
  assert.equal(D.pegarDivulgacao(id).proximo_em, dia(18, 9))
  assert.equal(D.pegarDivulgacao(id).envios, 3)
  assert.equal(D.proximaVez(dia(13, 9), 'semanal', dia(13, 10)), dia(20, 9))
})

test('divulgação com o WhatsApp caindo: tenta de novo depois, sem perder a vez', async () => {
  log.length = 0
  const id = D.criarDivulgacao({ texto: 'Promo' }, dia(12, 10))
  quedaUmaVez = true
  await F.enviarDivulgacoes(dia(12, 10))
  let d = D.pegarDivulgacao(id)
  assert.equal(d.status, 'agendada'); assert.match(d.erro, /tentar de novo/)
  await F.enviarDivulgacoes(dia(12, 10, 1))
  d = D.pegarDivulgacao(id)
  assert.equal(d.status, 'enviada'); assert.equal(d.erro, null)
})

test('todos os grupos pausados: a divulgação avisa que não saiu', async () => {
  G.pausarGrupo(A, true); G.pausarGrupo(B, true)
  const id = D.criarDivulgacao({ texto: 'Ninguém vai ver' }, dia(12, 10))
  await F.enviarDivulgacoes(dia(12, 10))
  const d = D.pegarDivulgacao(id)
  assert.equal(d.status, 'erro'); assert.match(d.erro, /nenhum grupo ativo/)
  G.pausarGrupo(A, false); G.pausarGrupo(B, false)
})

test('apagar divulgação devolve a foto só se ninguém mais usa', () => {
  const a = D.criarDivulgacao({ texto: '1', foto: 'igual.jpg' })
  const b = D.criarDivulgacao({ texto: '2', foto: 'igual.jpg' })
  assert.equal(D.apagarDivulgacao(a).foto, null)
  assert.equal(D.apagarDivulgacao(b).foto, 'igual.jpg')
  assert.equal(D.apagarDivulgacao(999).apagou, false)
  assert.equal(cfg('horario_ativo'), '0')
})
