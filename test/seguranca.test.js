// Verificação de membros: sinais de risco, mensagens suspeitas, lista da tela.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-seg-'))
const { db, salvarContato } = await import('../src/db.js')
const S = await import('../src/seguranca.js')
const P = await import('../src/punicoes.js')
const G = await import('../src/grupos.js')

test('sinais pelo número', () => {
  assert.equal(S.avaliar({ telefone: '5547999990000' }).nivel, 'ok')
  const fora = S.avaliar({ telefone: '6281234567890' })
  assert.equal(fora.pontos, 3); assert.match(fora.motivos[0], /fora do Brasil/)
  assert.match(S.avaliar({ telefone: '5520999990000' }).motivos[0], /DDD 20 não existe/)
  assert.match(S.avaliar({ telefone: '554733334444' }).motivos[0], /fixo/)
  assert.match(S.avaliar({ telefone: '' }).motivos[0], /escondido/)
  assert.equal(S.avaliar({ telefone: '' }).pontos, 0)
})

test('sinais somados: spam, nome, entrada recente, strike e bloqueio', () => {
  const agora = Date.now()
  const r = S.avaliar({ telefone: '6281234567890', nome: 'Suporte WhatsApp', spam: 1, entrou_em: agora - 3600_000 }, agora)
  assert.equal(r.nivel, 'alto'); assert.equal(r.pontos, 3 + 3 + 2 + 1)
  assert.equal(S.avaliar({ telefone: '5547999990000', strikes: 2 }).nivel, 'atencao')
  assert.equal(S.avaliar({ telefone: '5547999990000', bloqueado: true }).nivel, 'alto')
  assert.equal(S.avaliar({ telefone: '5547999990000', entrou_em: agora - 5 * 86400_000 }, agora).nivel, 'ok')
})

test('mensagens suspeitas', () => {
  assert.equal(S.textoSuspeito('Entra no meu grupo: https://chat.whatsapp.com/abc'), 'convite para outro grupo')
  assert.equal(S.textoSuspeito('olha isso www.site.com'), 'link')
  assert.match(S.textoSuspeito('Ganhe dinheiro com renda extra!'), /propaganda/)
  assert.equal(S.textoSuspeito('Quanto fica o Charizard? Pago no pix'), '')
  assert.equal(S.textoSuspeito(''), '')
})

test('verificação lê os grupos e monta a lista da tela', async () => {
  G.adicionarGrupo('g1@g.us', 'Grupo 1')
  const membros = {
    'g1@g.us': [
      { jid: '5547999990000@s.whatsapp.net', id_wa: '5547999990000@s.whatsapp.net', telefone: '5547999990000', admin: true },
      { jid: '6281234567890@s.whatsapp.net', id_wa: '6281234567890@s.whatsapp.net', telefone: '6281234567890' },
      { jid: '111@lid', id_wa: '111@lid', telefone: '' },
      { jid: '5541988887777@s.whatsapp.net', id_wa: '5541988887777@s.whatsapp.net', telefone: '5541988887777' },
      { jid: '5520911112222@s.whatsapp.net', id_wa: '5520911112222@s.whatsapp.net', telefone: '5520911112222' }
    ]
  }
  const wa = { membrosDoGrupo: async j => membros[j] }
  salvarContato('5541988887777@s.whatsapp.net', 'Bruna', null)
  S.registrarSpam('5541988887777@s.whatsapp.net', 'g1@g.us', 'https://bit.ly/golpe')
  S.registrarSpam('5541988887777@s.whatsapp.net', 'g1@g.us', 'renda extra aqui')
  const r = await S.verificarMembros(wa, G.listarGruposDoBot())
  assert.equal(r.membros, 5)
  let l = S.listarRiscos()
  assert.deepEqual(l.alto.map(m => m.jid).sort(), ['5541988887777@s.whatsapp.net'])
  assert.deepEqual(l.atencao.map(m => m.jid).sort(), ['5520911112222@s.whatsapp.net', '6281234567890@s.whatsapp.net'])
  assert.equal(l.escondidos, 1)
  assert.equal(l.alto[0].ultimoSpam.trecho, 'renda extra aqui')

  // Confiável sai dos alertas; admin nunca entra.
  S.marcarConfiavel('6281234567890@s.whatsapp.net', 'Lucas')
  l = S.listarRiscos()
  assert.equal(l.atencao.length, 1); assert.equal(l.confiaveis.length, 1)
  S.tirarConfiavel('6281234567890@s.whatsapp.net')

  // Bloqueado pelo CartaDex vira alto risco.
  P.bloquear('5520911112222@s.whatsapp.net', 'teste')
  assert.ok(S.listarRiscos().alto.some(m => m.jid === '5520911112222@s.whatsapp.net'))

  // Quem saiu do grupo some na próxima verificação.
  membros['g1@g.us'].pop()
  await S.verificarMembros(wa, G.listarGruposDoBot())
  assert.equal(S.listarRiscos().total, 4)
})

test('entrada no grupo: membro novo de fora do Brasil já aparece como risco', () => {
  const r = S.registrarEntrada('g1@g.us', { jid: '2348012345678@s.whatsapp.net', id_wa: '2348012345678@s.whatsapp.net', telefone: '2348012345678' })
  assert.equal(r.nivel, 'alto'); assert.equal(r.pontos, 4) // fora do Brasil (3) + entrou agora (1)
  assert.ok(db.prepare('SELECT entrou_em FROM membros WHERE jid = ?').get('2348012345678@s.whatsapp.net').entrou_em)
})
