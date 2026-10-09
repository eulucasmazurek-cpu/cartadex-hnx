// Testa a leitura de votos criptografados, inclusive em grupos que usam LID.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes, createCipheriv } from 'node:crypto'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-votos-'))
const { db } = await import('../src/db.js')
const { opcoesDaCarta } = await import('../src/leilao.js')
const V = await import('../src/votos.js')

// Cifra um voto do mesmo jeito que o app do WhatsApp faz.
function cifrar (opcoesTexto, { segredo, enqueteId, criador, votante }) {
  const corpo = Buffer.concat(opcoesTexto.map(t => Buffer.concat([Buffer.from([0x0a, 32]), V.sha256(t)])))
  const chave = V.chaveVoto(segredo, enqueteId, criador, votante)
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave, iv)
  c.setAAD(Buffer.from(`${enqueteId}\u0000${votante}`))
  const enc = Buffer.concat([c.update(corpo), c.final(), c.getAuthTag()])
  return { encPayload: new Uint8Array(enc), encIv: new Uint8Array(iv) }
}

const ops = opcoesDaCarta({ v1: 1000, v2: 1500, v3: 2000, arremate: 3500 })
const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('t', 0)").run().lastInsertRowid)
const cartaId = Number(db.prepare(`INSERT INTO cartas (lote_id, foto, v1, v2, v3, arremate, status, opcoes, enquete_msg_id)
  VALUES (?, 'x.jpg', 1000, 1500, 2000, 3500, 'no_ar', ?, 'ENQ1')`).run(lote, JSON.stringify(ops)).lastInsertRowid)
const segredo = randomBytes(32)
const segredoDa = id => (id === 'ENQ1' ? segredo : null)

// Bot: número 5547900000000 e LID 111222333.  Votante: número 5541988887777 e LID 999888777.
const meusJids = ['5547900000000:5@s.whatsapp.net', '111222333:5@lid']

function msgVoto (voto, key, ts = 1000) {
  return {
    key,
    messageTimestamp: 1,
    message: { pollUpdateMessage: { pollCreationMessageKey: { id: 'ENQ1', remoteJid: 'g@g.us', fromMe: true }, vote: voto, senderTimestampMs: ts } }
  }
}

test('decifra voto em grupo com LID (criador e votante por LID)', () => {
  const voto = cifrar([ops[2].texto], { segredo, enqueteId: 'ENQ1', criador: '111222333@lid', votante: '999888777@lid' })
  const r = V.processarVotoBruto(msgVoto(voto, { remoteJid: 'g@g.us', participant: '999888777@lid', participantAlt: '5541988887777@s.whatsapp.net', id: 'v1' }),
    { segredoDa, meusJids })
  assert.equal(r.ok, true)
  const v = db.prepare('SELECT * FROM votos WHERE carta_id = ?').all(cartaId)
  assert.equal(v.length, 1)
  assert.equal(v[0].votante, '999888777@lid')
  assert.equal(v[0].opcao, 2)
})

test('decifra voto em grupo com número de telefone', () => {
  const voto = cifrar([ops[3].texto], { segredo, enqueteId: 'ENQ1', criador: '5547900000000@s.whatsapp.net', votante: '5511911112222@s.whatsapp.net' })
  const r = V.processarVotoBruto(msgVoto(voto, { remoteJid: 'g@g.us', participant: '5511911112222@s.whatsapp.net', id: 'v2' }, 2000), { segredoDa, meusJids })
  assert.equal(r.ok, true)
  const v = db.prepare("SELECT opcao FROM votos WHERE votante = '5511911112222@s.whatsapp.net'").get()
  assert.equal(v.opcao, 3)
})

test('voto retirado (nenhuma opção) remove o lance', () => {
  const voto = cifrar([], { segredo, enqueteId: 'ENQ1', criador: '111222333@lid', votante: '999888777@lid' })
  const r = V.processarVotoBruto(msgVoto(voto, { remoteJid: 'g@g.us', participant: '999888777@lid', id: 'v3' }), { segredoDa, meusJids })
  assert.equal(r.ok, true)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM votos WHERE votante = '999888777@lid'").get().n, 0)
})

test('sem a chave certa, avisa em vez de travar', () => {
  const voto = cifrar([ops[0].texto], { segredo: randomBytes(32), enqueteId: 'ENQ1', criador: '111222333@lid', votante: '999888777@lid' })
  const r = V.processarVotoBruto(msgVoto(voto, { remoteJid: 'g@g.us', participant: '999888777@lid', id: 'v4' }), { segredoDa, meusJids })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /não consegui decifrar/)
})
