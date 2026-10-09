// Gerenciador de links: quem pode mandar link e quem tem o link apagado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-links-'))
const { setCfg } = await import('../src/db.js')
const L = await import('../src/links.js')

const ZE = { jid: '5547911112222@s.whatsapp.net', telefone: '5547911112222' }

test('acha links de vários jeitos e ignora texto comum', () => {
  assert.deepEqual(L.linksDoTexto('olha https://www.Golpe.com/x?y=1'), ['golpe.com'])
  assert.deepEqual(L.linksDoTexto('entra aí chat.whatsapp.com/AbC123'), ['chat.whatsapp.com'])
  assert.deepEqual(L.linksDoTexto('site minhaloja.com.br/cartas'), ['minhaloja.com.br'])
  assert.deepEqual(L.linksDoTexto('bit.ly/abc e wa.me/5547'), ['bit.ly', 'wa.me'])
  assert.deepEqual(L.linksDoTexto('Charizard ex 199/165 por R$ 1.200,00, pago no pix'), [])
  assert.deepEqual(L.linksDoTexto('ok. tá bom.Valeu'), [])
})

test('desligado: não apaga nada', () => {
  setCfg('links_ativo', '0')
  assert.equal(L.decidirLink({ texto: 'https://golpe.com', ...ZE }).apagar, false)
})

test('ligado: apaga link de membro comum, deixa admin, autorizado e site liberado', () => {
  setCfg('links_ativo', '1'); setCfg('links_dominios', 'minhaloja.com.br, ligapokemon.com.br')
  assert.deepEqual(L.decidirLink({ texto: 'compre aqui https://golpe.com', ...ZE }), { apagar: true, motivo: 'link de golpe.com' })
  assert.equal(L.decidirLink({ texto: 'oi pessoal', ...ZE }).apagar, false)
  assert.equal(L.decidirLink({ texto: 'https://golpe.com', ...ZE, admin: true }).apagar, false)
  assert.equal(L.decidirLink({ texto: 'veja https://www.minhaloja.com.br/x', ...ZE }).apagar, false)
  assert.equal(L.decidirLink({ texto: 'loja.ligapokemon.com.br/abc', ...ZE }).apagar, false) // subdomínio
  assert.equal(L.decidirLink({ texto: 'minhaloja.com.br e golpe.com', ...ZE }).apagar, true) // um liberado e um não
  assert.equal(L.decidirLink({ texto: 'fakeminhaloja.com.br', ...ZE }).apagar, true)
})

test('número autorizado pode mandar; tirar a autorização volta a apagar', () => {
  const chave = L.autorizar('(47) 91111-2222', 'Parceiro', 'Lucas')
  assert.equal(chave, '5547911112222') // sem o 55, o bot completa
  assert.equal(L.decidirLink({ texto: 'https://parceiro.com', ...ZE }).apagar, false)
  assert.equal(L.decidirLink({ texto: 'https://parceiro.com', jid: '777@lid', telefone: '5547911112222' }).apagar, false)
  assert.equal(L.decidirLink({ texto: 'https://parceiro.com', jid: '888@lid', telefone: '' }).apagar, true)
  L.desautorizar('5547911112222')
  assert.equal(L.decidirLink({ texto: 'https://parceiro.com', ...ZE }).apagar, true)
})

test('registro dos apagados', () => {
  L.registrarApagado(ZE.jid, 'g@g.us', 'https://golpe.com', true)
  L.registrarApagado(ZE.jid, 'g@g.us', 'https://outro.com', false, 'o bot precisa ser administrador do grupo')
  const l = L.ultimosApagados()
  assert.equal(l.length, 2); assert.equal(l[0].ok, 0)
  assert.equal(L.apagadosHoje(), 1)
})
