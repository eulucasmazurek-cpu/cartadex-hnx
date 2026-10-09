// Strikes: tirar o lance depois do prazo dá strike; trocar de lance não; 3 strikes bloqueiam.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-strikes-'))
const { db, setCfg } = await import('../src/db.js')
const L = await import('../src/leilao.js')
const S = await import('../src/punicoes.js')

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('L', 0)").run().lastInsertRowid)
const nova = () => {
  const ops = JSON.stringify(L.opcoesDaCarta({ v1: 1000, v2: 2000, v3: 3000, arremate: 6000 }))
  return Number(db.prepare("INSERT INTO cartas (lote_id, foto, v1, v2, v3, arremate, status, opcoes) VALUES (?, 'a.jpg', 1000, 2000, 3000, 6000, 'no_ar', ?)").run(lote, ops).lastInsertRowid)
}
const ANA = 'ana@s.whatsapp.net'; const BIA = 'bia@s.whatsapp.net'
const MIN = 60_000

test('tirar o lance dentro do prazo não dá strike', () => {
  const c = nova()
  L.registrarVoto(c, ANA, 2, 0)
  assert.equal(L.registrarVoto(c, ANA, null, 1.5 * MIN), null)
  assert.equal(S.contarStrikes(ANA), 0)
})

test('trocar de lance nunca dá strike, mesmo depois do prazo', () => {
  const c = nova()
  L.registrarVoto(c, ANA, 0, 0)
  L.registrarVoto(c, ANA, 2, 10 * MIN)
  assert.equal(S.contarStrikes(ANA), 0)
  assert.equal(L.votosDaCarta(c)[0].opcao, 2)
})

test('tirar o lance depois do prazo dá strike, e o prazo conta do último lance', () => {
  const c = nova()
  L.registrarVoto(c, ANA, 1, 0)
  L.registrarVoto(c, ANA, 2, 5 * MIN) // trocou aos 5 min
  assert.equal(L.registrarVoto(c, ANA, null, 6 * MIN), null) // tirou 1 min depois do último lance
  L.registrarVoto(c, ANA, 2, 7 * MIN)
  const r = L.registrarVoto(c, ANA, null, 10 * MIN)
  assert.deepEqual(r, { strike: true, bloqueou: false, total: 1 })
  assert.equal(L.votosDaCarta(c).length, 0)
})

test('com 3 strikes é bloqueado e os votos deixam de valer; desbloquear volta tudo', () => {
  for (let i = 0; i < 2; i++) {
    const c = nova(); L.registrarVoto(c, ANA, 0, 0); L.registrarVoto(c, ANA, null, 3 * MIN)
  }
  assert.equal(S.contarStrikes(ANA), 3)
  assert.equal(S.estaBloqueado(ANA), true)

  // Bloqueada, o maior lance da Ana não vale: ganha a Bia.
  const c = nova()
  L.registrarVoto(c, ANA, 3, 100)
  L.registrarVoto(c, BIA, 1, 200)
  const lider = L.liderAtual(db.prepare('SELECT * FROM cartas WHERE id = ?').get(c))
  assert.equal(lider.votante, BIA)

  S.desbloquear(ANA)
  assert.equal(S.estaBloqueado(ANA), false)
  assert.equal(S.contarStrikes(ANA), 0)
  assert.equal(L.liderAtual(db.prepare('SELECT * FROM cartas WHERE id = ?').get(c)).votante, ANA)
})

test('regras configuráveis: prazo, limite e desligar', () => {
  setCfg('strikes_minutos', '5'); setCfg('strikes_limite', '2')
  let c = nova(); L.registrarVoto(c, BIA, 0, 0)
  assert.equal(L.registrarVoto(c, BIA, null, 4 * MIN), null) // dentro dos 5 min
  c = nova(); L.registrarVoto(c, BIA, 0, 0); L.registrarVoto(c, BIA, null, 6 * MIN)
  c = nova(); L.registrarVoto(c, BIA, 0, 0)
  assert.equal(L.registrarVoto(c, BIA, null, 6 * MIN).bloqueou, true) // 2 strikes já bloqueiam

  S.desbloquear(BIA)
  setCfg('strikes_ativo', '0')
  c = nova(); L.registrarVoto(c, BIA, 0, 0)
  assert.equal(L.registrarVoto(c, BIA, null, 60 * MIN), null)
  assert.equal(S.contarStrikes(BIA), 0)
})

test('lista da tela e ajustes manuais', () => {
  setCfg('strikes_ativo', '1'); setCfg('strikes_minutos', '2'); setCfg('strikes_limite', '3')
  const c = nova(); L.registrarVoto(c, BIA, 0, 0); L.registrarVoto(c, BIA, null, 3 * MIN)
  let p = S.listarPunicoes()
  assert.equal(p.comStrike[0].votante, BIA); assert.equal(p.comStrike[0].n, 1); assert.equal(p.comStrike[0].carta_id, c)
  S.tirarUmStrike(BIA)
  assert.equal(S.contarStrikes(BIA), 0)
  S.bloquear('5547999990000@s.whatsapp.net', 'bloqueado pelo painel', 'Lucas')
  p = S.listarPunicoes()
  assert.equal(p.bloqueados[0].por, 'Lucas')
  const atividade = db.prepare("SELECT texto FROM atividade WHERE usuario = 'CartaDex'").all().map(x => x.texto).join('\n')
  assert.match(atividade, /Strike 1\/3/)
  assert.match(atividade, /foi bloqueado/)
})
