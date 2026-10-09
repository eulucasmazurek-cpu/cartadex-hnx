// Backup automático: copia o banco (lotes, cartas, vendas, remessas...) todo dia,
// guarda as últimas cópias no servidor e envia para o Google Drive pelo rclone.
// O login do WhatsApp fica de fora de propósito (quem tivesse o arquivo poderia usar o número do bot).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { db, cfg, setCfg, PASTA_DADOS, PASTA_FOTOS } from './db.js'
import { rclone, situacaoRclone, juntar, nomeDoRemoto, ehBackup } from './rclone.js'

export const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups')
export const MANTER_NO_SERVIDOR = 20

const dois = n => String(n).padStart(2, '0')
const dia = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`

let rodando = false
export const backupRodando = () => rodando

export function statusBackup () {
  try { return JSON.parse(cfg('backup_status') || 'null') } catch { return null }
}

// Hora de fazer o backup do dia? Se falhou, tenta de novo 1 hora depois.
export function backupPendente (agora = new Date()) {
  if (cfg('backup_ativo') !== '1' || rodando) return false
  if (agora.getHours() < Number(cfg('backup_hora'))) return false
  if (cfg('backup_dia') === dia(agora)) return false
  const s = statusBackup()
  if (s && !s.ok && agora.getTime() - s.ts < 60 * 60_000) return false
  return true
}

// Cópia feita antes de excluir algo: o nome termina com os milissegundos (…_10-30-05-123.db.gz).
export const ehAntesDeApagar = nome => /_\d{2}-\d{2}-\d{2}-\d{3}\.db\.gz$/.test(nome)

export function listarBackupsLocais () {
  try {
    return fs.readdirSync(PASTA_BACKUPS).filter(ehBackup).sort().reverse()
      .map(nome => ({ nome, tamanho: fs.statSync(path.join(PASTA_BACKUPS, nome)).size }))
  } catch { return [] }
}

// Cópia do banco feita pelo próprio SQLite (fica certinha mesmo com o bot funcionando), compactada.
async function copiarBanco (agora, extra = '') {
  fs.mkdirSync(PASTA_BACKUPS, { recursive: true })
  const nome = `cartadex-${dia(agora)}_${dois(agora.getHours())}-${dois(agora.getMinutes())}-${dois(agora.getSeconds())}${extra}.db`
  const bruto = path.join(PASTA_BACKUPS, nome)
  fs.rmSync(bruto, { force: true })
  db.exec(`VACUUM INTO '${bruto.replaceAll("'", "''")}'`)
  const gz = bruto + '.gz'
  try {
    await pipeline(fs.createReadStream(bruto), zlib.createGzip({ level: 9 }), fs.createWriteStream(gz))
  } finally {
    fs.rmSync(bruto, { force: true })
  }
  // As cópias de antes de apagar giram separadas das do dia: muitas exclusões seguidas
  // não podem empurrar para fora os backups diários.
  const todos = listarBackupsLocais()
  const velhos = [...todos.filter(b => !ehAntesDeApagar(b.nome)).slice(MANTER_NO_SERVIDOR), ...todos.filter(b => ehAntesDeApagar(b.nome)).slice(MANTER_NO_SERVIDOR)]
  for (const velho of velhos) fs.rmSync(path.join(PASTA_BACKUPS, velho.nome), { force: true })
  return gz
}

export async function fazerBackup ({ agora = new Date() } = {}) {
  if (rodando) return statusBackup()
  rodando = true
  const inicio = Date.now()
  const destino = cfg('backup_remoto')
  const s = { ts: agora.getTime(), ok: false, drive: '', local: '', tamanho: 0, msg: '' }
  try {
    const arquivo = await copiarBanco(agora)
    s.local = path.basename(arquivo)
    s.tamanho = fs.statSync(arquivo).size
    const r = await situacaoRclone(destino)
    if (!r.instalado) {
      s.ok = true; s.drive = 'sem_rclone'; s.msg = 'Cópia salva só no servidor: o rclone não está instalado.'
    } else if (!r.conectado) {
      s.ok = true; s.drive = 'sem_remoto'; s.msg = `Cópia salva só no servidor: o Google Drive ("${nomeDoRemoto(destino)}") ainda não foi conectado no rclone.`
    } else {
      s.drive = 'erro'
      await rclone(['copy', arquivo, juntar(destino, 'banco')], { timeout: 15 * 60_000 })
      // Fotos: só as novas sobem (o rclone pula as que já estão lá).
      if (cfg('backup_fotos') === '1') await rclone(['copy', PASTA_FOTOS, juntar(destino, 'fotos'), '--transfers=2'], { timeout: 3 * 60 * 60_000 })
      const dias = Number(cfg('backup_dias')) || 30
      await rclone(['delete', juntar(destino, 'banco'), `--min-age=${dias}d`], { timeout: 5 * 60_000 })
        .catch(e => console.error('Backup: não consegui apagar as cópias antigas do Drive:', e.message))
      s.ok = true; s.drive = 'ok'; s.msg = 'Enviado ao Google Drive.'
    }
  } catch (e) {
    s.ok = false
    s.drive = s.drive || 'erro'
    s.msg = e.message
    console.error('❌ Backup falhou:', e.message)
  } finally {
    s.segundos = Math.round((Date.now() - inicio) / 1000)
    setCfg('backup_status', JSON.stringify(s))
    if (s.ok) setCfg('backup_dia', dia(agora))
    rodando = false
  }
  if (s.ok) console.log(`💾 Backup feito${s.drive === 'ok' ? ' e enviado ao Google Drive' : ' (só no servidor)'}`)
  return s
}

// Cópia rápida antes de apagar algo (só o banco, sem fotos). Vai para o Google Drive se ele estiver conectado.
// Não conta como o backup do dia.
export async function backupAntesDeApagar ({ agora = new Date() } = {}) {
  if (rodando) return { ok: false, msg: 'já tem um backup em andamento, tente de novo em instantes' }
  rodando = true
  try {
    const arquivo = await copiarBanco(agora, '-' + String(agora.getMilliseconds()).padStart(3, '0'))
    const s = { ok: true, local: path.basename(arquivo), drive: '' }
    const destino = cfg('backup_remoto')
    const r = await situacaoRclone(destino).catch(() => ({}))
    if (r.instalado && r.conectado) {
      try { await rclone(['copy', arquivo, juntar(destino, 'banco')], { timeout: 3 * 60_000 }); s.drive = 'ok' } catch (e) { console.error('Backup antes de apagar: não subiu para o Drive:', e.message) }
    }
    console.log(`💾 Backup antes de apagar: ${s.local}${s.drive === 'ok' ? ' (Drive também)' : ''}`)
    return s
  } catch (e) {
    return { ok: false, msg: e.message }
  } finally {
    rodando = false
  }
}

export function iniciarBackup () {
  setInterval(() => {
    if (backupPendente()) fazerBackup().catch(e => console.error('Erro no backup:', e))
  }, 60_000)
}
