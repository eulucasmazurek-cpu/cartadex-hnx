// Backup: cópia do banco, envio ao "Google Drive" (rclone de mentira), falhas, horário e restauração.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FALSO = path.join(RAIZ, 'test', 'apoio', 'rclone-falso.sh')
const temp = nome => fs.mkdtempSync(path.join(os.tmpdir(), nome))

process.env.PASTA_DADOS = temp('pokebot-backup-')
process.env.DRIVE_FALSO = temp('drive-falso-')
process.env.RCLONE = FALSO

const { db, setCfg, cfg, PASTA_FOTOS } = await import('../src/db.js')
const B = await import('../src/backup.js')

const lote = Number(db.prepare("INSERT INTO lotes (nome, criado_em) VALUES ('Lote 1', 0)").run().lastInsertRowid)
db.prepare("INSERT INTO cartas (lote_id, foto, descricao, status, valor_venda) VALUES (?, 'mew.jpg', 'Mew', 'vendida', 4500)").run(lote)
fs.writeFileSync(path.join(PASTA_FOTOS, 'mew.jpg'), 'foto-de-mentira')

const abrirGz = arquivo => {
  const destino = arquivo.replace(/\.gz$/, '.teste')
  fs.writeFileSync(destino, zlib.gunzipSync(fs.readFileSync(arquivo)))
  return new DatabaseSync(destino)
}
const portaLivre = () => new Promise(resolve => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)) }) })

test('sem rclone: guarda a cópia só no servidor, e ela abre certinho', async () => {
  process.env.RCLONE = '/nao/existe/rclone'
  const s = await B.fazerBackup({ agora: new Date(2026, 9, 7, 3, 0, 1) })
  process.env.RCLONE = FALSO
  assert.equal(s.ok, true)
  assert.equal(s.drive, 'sem_rclone')
  const locais = B.listarBackupsLocais()
  assert.equal(locais.length, 1)
  const copia = abrirGz(path.join(B.PASTA_BACKUPS, locais[0].nome))
  assert.equal(copia.prepare('SELECT descricao FROM cartas').get().descricao, 'Mew')
  copia.close()
})

test('com o Google Drive conectado: envia banco e fotos', async () => {
  const s = await B.fazerBackup({ agora: new Date(2026, 9, 7, 3, 0, 2) })
  assert.equal(s.ok, true)
  assert.equal(s.drive, 'ok')
  const noDrive = fs.readdirSync(path.join(process.env.DRIVE_FALSO, 'CartaDex', 'banco'))
  assert.ok(noDrive.includes(s.local))
  assert.equal(fs.readFileSync(path.join(process.env.DRIVE_FALSO, 'CartaDex', 'fotos', 'mew.jpg'), 'utf8'), 'foto-de-mentira')
  assert.match(fs.readFileSync(path.join(process.env.DRIVE_FALSO, '.apagados'), 'utf8'), /--min-age=30d/)
  assert.equal(cfg('backup_dia'), '2026-10-07')
})

test('remoto com outro nome ainda não configurado: avisa e guarda no servidor', async () => {
  setCfg('backup_remoto', 'outro:Pasta')
  const s = await B.fazerBackup({ agora: new Date(2026, 9, 7, 3, 0, 3) })
  setCfg('backup_remoto', 'gdrive:CartaDex')
  assert.equal(s.ok, true)
  assert.equal(s.drive, 'sem_remoto')
  assert.match(s.msg, /"outro"/)
})

test('sem internet: marca falha e tenta de novo 1 hora depois', async () => {
  setCfg('backup_dia', '')
  process.env.FALHAR_REDE = '1'
  const t0 = new Date(2026, 9, 8, 3, 0, 4)
  const s = await B.fazerBackup({ agora: t0 })
  delete process.env.FALHAR_REDE
  assert.equal(s.ok, false)
  assert.match(s.msg, /no such host/)
  assert.ok(s.local, 'a cópia no servidor foi feita mesmo assim')
  assert.equal(B.backupPendente(new Date(t0.getTime() + 30 * 60_000)), false)
  assert.equal(B.backupPendente(new Date(t0.getTime() + 61 * 60_000)), true)
})

test('horário: só depois da hora marcada e uma vez por dia', () => {
  setCfg('backup_status', ''); setCfg('backup_dia', ''); setCfg('backup_hora', '3')
  assert.equal(B.backupPendente(new Date(2026, 9, 9, 2, 59)), false)
  assert.equal(B.backupPendente(new Date(2026, 9, 9, 3, 0)), true)
  assert.equal(B.backupPendente(new Date(2026, 9, 9, 18, 0)), true) // servidor estava desligado às 3h: faz quando voltar
  setCfg('backup_dia', '2026-10-09')
  assert.equal(B.backupPendente(new Date(2026, 9, 9, 18, 0)), false)
  setCfg('backup_ativo', '0')
  assert.equal(B.backupPendente(new Date(2026, 9, 10, 4, 0)), false)
  setCfg('backup_ativo', '1')
})

test('guarda só as últimas cópias no servidor', async () => {
  const n = B.MANTER_NO_SERVIDOR + 2
  for (let i = 0; i < n; i++) await B.fazerBackup({ agora: new Date(2026, 9, 11, 4, i, 0) })
  const locais = B.listarBackupsLocais()
  assert.equal(locais.length, B.MANTER_NO_SERVIDOR)
  assert.equal(locais[0].nome, `cartadex-2026-10-11_04-${String(n - 1).padStart(2, '0')}-00.db.gz`)
})

test('backup antes de excluir tem nome próprio (dois no mesmo segundo não se sobrescrevem)', async () => {
  const t = new Date(2026, 9, 12, 9, 0, 0, 5)
  const a = await B.backupAntesDeApagar({ agora: t })
  const b = await B.backupAntesDeApagar({ agora: new Date(t.getTime() + 100) })
  assert.ok(a.ok && b.ok); assert.notEqual(a.local, b.local)
  assert.match(a.local, /^cartadex-2026-10-12_09-00-00-005\.db\.gz$/)
})

test('muitas exclusões seguidas não apagam os backups diários', async () => {
  const diarios = B.listarBackupsLocais().filter(b => !B.ehAntesDeApagar(b.nome)).length
  assert.ok(diarios > 0)
  for (let i = 0; i < B.MANTER_NO_SERVIDOR + 3; i++) await B.backupAntesDeApagar({ agora: new Date(2026, 9, 13, 10, 0, i, 7) })
  const locais = B.listarBackupsLocais()
  assert.equal(locais.filter(b => !B.ehAntesDeApagar(b.nome)).length, diarios)
  assert.equal(locais.filter(b => B.ehAntesDeApagar(b.nome)).length, B.MANTER_NO_SERVIDOR)
})

test('restaurar do Drive num servidor novo (banco e fotos)', async () => {
  const novo = temp('servidor-novo-')
  const r = spawnSync(process.execPath, ['src/restaurar.js'], {
    cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PASTA_DADOS: novo, PORTA: String(await portaLivre()) }
  })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /1 lote\(s\), 1 carta\(s\), 1 vendida\(s\)/)
  const t = new DatabaseSync(path.join(novo, 'pokebot.db'))
  assert.equal(t.prepare('SELECT descricao FROM cartas').get().descricao, 'Mew')
  t.close()
  assert.ok(fs.existsSync(path.join(novo, 'fotos', 'mew.jpg')))
})

test('restaurar guarda o banco atual e recusa rodar com o bot ligado', async () => {
  const pasta = temp('servidor-velho-')
  fs.writeFileSync(path.join(pasta, 'pokebot.db'), 'banco-antigo')
  fs.mkdirSync(path.join(pasta, 'backups'))
  fs.copyFileSync(path.join(B.PASTA_BACKUPS, B.listarBackupsLocais()[0].nome), path.join(pasta, 'backups', B.listarBackupsLocais()[0].nome))

  // Bot ligado (porta ocupada): não mexe em nada.
  const ocupada = net.createServer().listen(0)
  await new Promise(resolve => ocupada.once('listening', resolve))
  const r1 = spawnSync(process.execPath, ['src/restaurar.js', '--local'], {
    cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PASTA_DADOS: pasta, PORTA: String(ocupada.address().port) }
  })
  ocupada.close()
  assert.equal(r1.status, 1)
  assert.match(r1.stderr, /parece estar ligado/)
  assert.equal(fs.readFileSync(path.join(pasta, 'pokebot.db'), 'utf8'), 'banco-antigo')

  // Bot desligado: restaura da cópia do servidor e guarda o antigo.
  const r2 = spawnSync(process.execPath, ['src/restaurar.js', '--local'], {
    cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PASTA_DADOS: pasta, PORTA: String(await portaLivre()) }
  })
  assert.equal(r2.status, 0, r2.stderr)
  const guardado = fs.readdirSync(pasta).find(f => f.startsWith('pokebot.db.antes-'))
  assert.ok(guardado)
  assert.equal(fs.readFileSync(path.join(pasta, guardado), 'utf8'), 'banco-antigo')
  const t = new DatabaseSync(path.join(pasta, 'pokebot.db'))
  assert.equal(t.prepare('SELECT COUNT(*) n FROM cartas').get().n, 1)
  t.close()
})

test('backup com defeito não substitui o banco', async () => {
  const pasta = temp('servidor-defeito-')
  fs.mkdirSync(path.join(pasta, 'backups'))
  fs.writeFileSync(path.join(pasta, 'backups', 'cartadex-2026-10-12_03-00-00.db.gz'), zlib.gzipSync('isto não é um banco'))
  fs.writeFileSync(path.join(pasta, 'pokebot.db'), 'banco-bom')
  const r = spawnSync(process.execPath, ['src/restaurar.js', '--local'], {
    cwd: RAIZ, encoding: 'utf8', env: { ...process.env, PASTA_DADOS: pasta, PORTA: String(await portaLivre()) }
  })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /não pôde ser usado/)
  assert.equal(fs.readFileSync(path.join(pasta, 'pokebot.db'), 'utf8'), 'banco-bom')
})
