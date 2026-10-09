import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerUsuarios, problemasUsuarios, conferirLogin, criarLimitador, ipDe, descreverAcao } from '../src/usuarios.js'

const env = { SENHA_LUCAS: 'senha-do-lucas', SENHA_VITOR: 'senha-do-vitor', SENHA_BIA: 'senha-da-bia', PATH: '/bin' }

test('lê um usuário por linha SENHA_NOME', () => {
  const u = lerUsuarios(env)
  assert.deepEqual(u.map(x => x.login), ['bia', 'lucas', 'vitor'])
  assert.deepEqual(u.map(x => x.nome), ['Bia', 'Lucas', 'Vitor'])
  assert.deepEqual(problemasUsuarios(u), [])
})

test('login antigo continua valendo quando não há SENHA_NOME', () => {
  const u = lerUsuarios({ PAINEL_USUARIO: 'admin', PAINEL_SENHA: 'uma-senha-boa' })
  assert.equal(u.length, 1)
  assert.equal(u[0].login, 'admin')
})

test('recusa senha curta, padrão, repetida ou nenhum usuário', () => {
  assert.equal(problemasUsuarios([]).length, 1)
  assert.equal(problemasUsuarios(lerUsuarios({ SENHA_LUCAS: 'curta' })).length, 1)
  assert.equal(problemasUsuarios(lerUsuarios({ SENHA_LUCAS: 'troque-esta-senha' })).length, 1)
  assert.match(problemasUsuarios(lerUsuarios({ SENHA_LUCAS: 'mesma-senha', SENHA_VITOR: 'mesma-senha' }))[0], /igual/)
})

test('cada um entra só com a própria senha', () => {
  const u = lerUsuarios(env)
  assert.equal(conferirLogin(u, 'lucas', 'senha-do-lucas')?.nome, 'Lucas')
  assert.equal(conferirLogin(u, 'Bia', 'senha-da-bia')?.nome, 'Bia')
  assert.equal(conferirLogin(u, 'lucas', 'senha-do-vitor'), null)
  assert.equal(conferirLogin(u, 'admin', 'senha-do-lucas'), null)
  assert.equal(conferirLogin(u, '', ''), null)
})

test('bloqueia o endereço depois de muitas senhas erradas', () => {
  const l = criarLimitador({ max: 3, janelaMs: 60_000, bloqueioMs: 600_000 })
  assert.equal(l.falhou('1.1.1.1', 0), false)
  assert.equal(l.falhou('1.1.1.1', 1000), false)
  assert.equal(l.falhou('1.1.1.1', 2000), true)
  assert.equal(l.bloqueado('1.1.1.1', 3000), 10)
  assert.equal(l.bloqueado('2.2.2.2', 3000), 0)
  assert.equal(l.bloqueado('1.1.1.1', 700_000), 0)
  l.falhou('3.3.3.3', 0); l.acertou('3.3.3.3')
  assert.equal(l.falhou('3.3.3.3', 1), false)
})

test('endereço real atrás do túnel, sem confiar em cabeçalho vindo de fora', () => {
  const r = (remoto, xff) => ({ socket: { remoteAddress: remoto }, headers: xff ? { 'x-forwarded-for': xff } : {} })
  assert.equal(ipDe(r('127.0.0.1', '9.9.9.9, 200.1.2.3')), '200.1.2.3')
  assert.equal(ipDe(r('::ffff:192.168.1.50', '9.9.9.9')), '192.168.1.50')
  assert.equal(ipDe(r('::1')), '::1')
})

test('descreve as ações', () => {
  assert.deepEqual(descreverAcao('/lotes/7/enviar'), { texto: 'Enviou cartas do lote', loteId: 7 })
  assert.equal(descreverAcao('/config').texto, 'Alterou as configurações')
})
