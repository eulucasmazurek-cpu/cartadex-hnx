// Aviso no privado para o ganhador: fotos das cartas + mensagem com o link de pagamento.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-ganhador-'))
const { db, setCfg, PASTA_FOTOS } = await import('../src/db.js')
const G = await import('../src/ganhador.js')
G._semEspera()

fs.mkdirSync(PASTA_FOTOS, { recursive: true })
for (const f of ['a.jpg', 'b.jpg', 'c.jpg']) fs.writeFileSync(path.join(PASTA_FOTOS, f), 'x')

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Lote 1', 0)").run().lastInsertRowid)
const vendida = (foto, desc, valor, quem) => {
  const id = Number(db.prepare(`INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, status, vencedor, valor_venda, encerrada_em)
    VALUES (?, ?, ?, 1000, 2000, 3000, 'vendida', ?, ?, ?)`).run(lote, foto, desc, quem, valor, Date.now()).lastInsertRowid)
  return db.prepare('SELECT * FROM cartas WHERE id = ?').get(id)
}
db.prepare("INSERT OR REPLACE INTO contatos VALUES ('777@lid', 'Bruna Souza', '+5547988887777')").run()
db.prepare("INSERT OR REPLACE INTO contatos VALUES ('5511999990000@s.whatsapp.net', NULL, NULL)").run()

function whatsFalso () {
  const log = []
  return {
    log,
    estado: { conectado: true },
    enviarFoto: async (caminho, legenda, para) => { log.push(['foto', para, path.basename(caminho), legenda]) },
    enviarTexto: async (texto, m, para) => { log.push(['texto', para, texto]) }
  }
}

test('mensagem com nome, cartas, total e link (com {valor})', () => {
  const c1 = vendida('a.jpg', 'Charizard ex\n199/165', 15000, '777@lid')
  const t = G.textoGanhador([c1], '777@lid', G.MENSAGEM_PADRAO, 'https://pague.com/x?v={valor}')
  assert.match(t, /Parabéns, Bruna!/)
  assert.match(t, /a carta #\d+/)
  assert.match(t, /R\$\s?150,00/)
  assert.match(t, /https:\/\/pague\.com\/x\?v=150\.00/)
  // Sem link, a linha do link some; sem nome, não fica "Parabéns, !".
  const t2 = G.textoGanhador([c1], '5511999990000@s.whatsapp.net', G.MENSAGEM_PADRAO, '')
  assert.doesNotMatch(t2, /\{link\}|Pague por aqui/)
  assert.match(t2, /^🎉 Parabéns! /)
})

test('manda para o telefone quando conhece; senão para o próprio identificador', () => {
  assert.equal(G.destinoDe('777@lid'), '5547988887777@s.whatsapp.net')
  assert.equal(G.destinoDe('999@lid'), '999@lid')
})

test('desligado não manda nada; ligado agrupa por ganhador e não repete', async () => {
  const wa = whatsFalso()
  const b1 = vendida('b.jpg', 'Pikachu', 5000, '777@lid')
  const b2 = vendida('c.jpg', 'Mew', 7000, '777@lid')
  const o = vendida('a.jpg', 'Eevee', 3000, '5511999990000@s.whatsapp.net')
  const res = [b1, b2, o].map(c => ({ carta: c, vencedor: { votante: c.vencedor, valor: c.valor_venda } }))
  res.push({ carta: { id: 9999 }, vencedor: null }) // sem lance: ignorado

  setCfg('ganhador_ativo', '0')
  assert.deepEqual(await G.avisarGanhadores(wa, res), { enviados: 0, falhas: 0 })
  assert.equal(wa.log.length, 0)

  setCfg('ganhador_ativo', '1'); setCfg('ganhador_link', 'https://loja.com/pagar')
  assert.deepEqual(await G.avisarGanhadores(wa, res), { enviados: 2, falhas: 0 })
  const paraBruna = wa.log.filter(l => l[1] === '5547988887777@s.whatsapp.net')
  assert.deepEqual(paraBruna.map(l => l[0]), ['foto', 'foto', 'texto']) // fotos antes, mensagem no fim
  assert.match(paraBruna[2][2], /2 cartas/); assert.match(paraBruna[2][2], /R\$\s?120,00/); assert.match(paraBruna[2][2], /loja\.com\/pagar/)
  assert.match(paraBruna[0][3], /Pikachu/)
  assert.equal(G.avisoDaCarta(b1.id).ok, 1)

  // Encerrar de novo (ou duas vezes) não manda outra vez.
  const antes = wa.log.length
  await G.avisarGanhadores(wa, res)
  assert.equal(wa.log.length, antes)
})

test('erro fica registrado e dá para mandar de novo pelo painel', async () => {
  const c = vendida('a.jpg', 'Gengar', 4000, '888@lid')
  const quebrado = { estado: { conectado: true }, enviarFoto: async () => { throw new Error('falhou a rede') }, enviarTexto: async () => {} }
  setCfg('ganhador_ativo', '1')
  assert.deepEqual(await G.avisarGanhadores(quebrado, [{ carta: c, vencedor: { votante: '888@lid' } }]), { enviados: 0, falhas: 1 })
  const a = G.avisoDaCarta(c.id)
  assert.equal(a.ok, 0); assert.match(a.erro, /falhou a rede/)

  const wa = whatsFalso()
  const { total, pronto } = G.avisarComprador(wa, '888@lid')
  assert.equal(total, 1)
  assert.equal(await pronto, true)
  assert.equal(G.avisoDaCarta(c.id).ok, 1)
  assert.equal(G.avisarComprador(wa, 'ninguem@lid').total, 0)
})

test('WhatsApp desconectado: registra a falha sem travar', async () => {
  const c = vendida('a.jpg', 'Snorlax', 2000, '999@lid')
  const r = await G.avisarGanhadores({ estado: { conectado: false } }, [{ carta: c, vencedor: { votante: '999@lid' } }])
  assert.deepEqual(r, { enviados: 0, falhas: 1 })
  assert.match(G.avisoDaCarta(c.id).erro, /desconectado/)
})
