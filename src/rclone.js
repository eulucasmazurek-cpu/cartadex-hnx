// Chamadas ao rclone, o programa que envia e baixa arquivos do Google Drive.
// Fica separado do banco para o script de restauração poder usar sem abrir o banco.
import { execFile } from 'node:child_process'

const programa = () => process.env.RCLONE || 'rclone'

// Roda o rclone e devolve o que ele escreveu. Os erros viram mensagens curtas em português.
export function rclone (args, { timeout = 10 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(programa(), args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(String(stdout))
      const semRclone = err.code === 'ENOENT'
      const detalhe = String(stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' ')
      const e = new Error(semRclone ? 'o rclone não está instalado' : err.killed ? 'demorou demais e foi interrompido' : (detalhe || err.message).slice(0, 300))
      e.semRclone = semRclone
      reject(e)
    })
  })
}

// "gdrive:CartaDex" + "banco" -> "gdrive:CartaDex/banco"
export function juntar (base, sub) {
  const b = String(base).replace(/\/+$/, '')
  return b.endsWith(':') ? b + sub : `${b}/${sub}`
}

export const nomeDoRemoto = destino => String(destino || '').split(':')[0]

// { instalado, conectado }: o rclone existe e o remoto (ex.: "gdrive") foi configurado?
export async function situacaoRclone (destino) {
  try {
    const lista = (await rclone(['listremotes'], { timeout: 20_000 })).split('\n').map(s => s.trim())
    return { instalado: true, conectado: lista.includes(nomeDoRemoto(destino) + ':') }
  } catch (e) {
    return { instalado: !e.semRclone, conectado: false, erro: e.semRclone ? '' : e.message }
  }
}

export const ehBackup = nome => /^cartadex-[\d_-]+\.db\.gz$/.test(nome)
