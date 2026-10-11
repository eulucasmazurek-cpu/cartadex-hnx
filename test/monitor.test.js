import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
process.env.PASTA_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebot-monitor-'))
const { setCfg } = await import('../src/db.js')
const M = await import('../src/monitor.js')

const enviados = []
let resposta = 200
M._usarFetch(async (url, op) => { enviados.push({ url, corpo: op.body }); return { ok: resposta < 300, status: resposta } })
let tunel = true
M._usarTunel(async () => tunel)
const wa = { estado: { conectado: true } }

test('sem endereço: não manda nada', async () => {
  setCfg('monitor_url', '')
  assert.equal(await M.sinalizar(wa), null)
  assert.equal(enviados.length, 0)
  assert.equal(M.resumoMonitor().ligado, false)
})

test('endereço inválido (sem https) é ignorado', () => {
  setCfg('monitor_url', 'http://hc-ping.com/abc')
  assert.equal(M.urlMonitor(), null)
})

test('tudo certo: manda o "estou vivo" no endereço puro', async () => {
  setCfg('monitor_url', 'https://hc-ping.com/1234-abcd/')
  const r = await M.sinalizar(wa, 1_000_000)
  assert.equal(enviados.at(-1).url, 'https://hc-ping.com/1234-abcd')
  assert.ok(r.ok); assert.match(M.resumoMonitor().texto, /tudo certo/)
})

test('WhatsApp desconectado: só avisa depois de 3 minutos', async () => {
  wa.estado.conectado = false
  let r = await M.sinalizar(wa, 2_000_000)
  assert.ok(r.ok, 'logo que cai, ainda não é problema')
  r = await M.sinalizar(wa, 2_000_000 + 4 * 60_000)
  assert.equal(r.ok, false)
  assert.equal(enviados.at(-1).url, 'https://hc-ping.com/1234-abcd/fail')
  assert.match(enviados.at(-1).corpo, /WhatsApp desconectado há 4 min/)
  wa.estado.conectado = true
  r = await M.sinalizar(wa, 2_000_000 + 5 * 60_000)
  assert.ok(r.ok, 'voltou: sinal normal de novo')
  wa.estado.conectado = false
  r = await M.sinalizar(wa, 2_000_000 + 6 * 60_000)
  assert.ok(r.ok, 'a contagem recomeça depois de reconectar')
  wa.estado.conectado = true
})

test('túnel parado vira problema; túnel não instalado não', async () => {
  tunel = false
  let r = await M.sinalizar(wa, 3_000_000)
  assert.equal(r.ok, false); assert.match(r.texto, /Túnel da Cloudflare parado/)
  tunel = null
  r = await M.sinalizar(wa, 3_060_000)
  assert.ok(r.ok)
  tunel = true
})

test('serviço fora ou endereço errado: mostra o erro no painel', async () => {
  resposta = 404
  const r = await M.sinalizar(wa, 4_000_000)
  assert.match(r.erro, /não reconheceu/)
  assert.equal(M.resumoMonitor().ruim, true)
  resposta = 200
})
