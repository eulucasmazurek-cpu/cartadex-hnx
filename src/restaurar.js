// Restaura o banco a partir de um backup.
//   npm run restaurar                     -> último backup do Google Drive (banco e fotos)
//   npm run restaurar -- --local          -> último backup guardado no próprio servidor
//   npm run restaurar -- --sem-fotos      -> só o banco, sem baixar as fotos
//   npm run restaurar -- gdrive:OutraPasta
// O banco atual não é apagado: fica guardado como pokebot.db.antes-<data>.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { DatabaseSync } from 'node:sqlite'
import { rclone, juntar, ehBackup } from './rclone.js'

const PASTA_DADOS = process.env.PASTA_DADOS || path.resolve('dados')
const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups')
const PASTA_FOTOS = path.join(PASTA_DADOS, 'fotos')
const BANCO = process.env.ARQUIVO_BANCO || path.join(PASTA_DADOS, 'pokebot.db')

const args = process.argv.slice(2)
const doServidor = args.includes('--local')
const comFotos = !doServidor && !args.includes('--sem-fotos')
const destino = args.find(a => /^[\w.-]+:/.test(a)) || process.env.BACKUP_REMOTO || 'gdrive:CartaDex'

function sair (msg) {
  console.error('❌ ' + msg)
  process.exit(1)
}

// O bot precisa estar desligado, senão ele continuaria usando o banco antigo.
const porta = Number(process.env.PORTA) || 3000
const livre = await new Promise(resolve => {
  const s = net.createServer()
  s.once('error', () => resolve(false))
  s.once('listening', () => s.close(() => resolve(true)))
  s.listen(porta, '0.0.0.0')
})
if (!livre) sair(`O bot parece estar ligado (a porta ${porta} está em uso). Desligue o bot e rode de novo.`)

fs.mkdirSync(PASTA_BACKUPS, { recursive: true })
let gz
if (doServidor) {
  const nomes = fs.readdirSync(PASTA_BACKUPS).filter(ehBackup).sort()
  if (!nomes.length) sair(`Nenhum backup guardado em ${PASTA_BACKUPS}`)
  gz = path.join(PASTA_BACKUPS, nomes.at(-1))
} else {
  console.log(`☁️  Procurando backups em ${destino} ...`)
  let lista = ''
  try { lista = await rclone(['lsf', '--files-only', juntar(destino, 'banco')], { timeout: 2 * 60_000 }) } catch (e) { sair('Não consegui ver o Google Drive: ' + e.message) }
  const nomes = lista.split('\n').map(s => s.trim()).filter(ehBackup).sort()
  if (!nomes.length) sair('Nenhum backup encontrado no Google Drive.')
  gz = path.join(PASTA_BACKUPS, nomes.at(-1))
  if (!fs.existsSync(gz)) {
    try { await rclone(['copyto', juntar(destino, 'banco/' + nomes.at(-1)), gz], { timeout: 15 * 60_000 }) } catch (e) { sair('Não consegui baixar o backup: ' + e.message) }
  }
}
console.log('📦 Backup escolhido: ' + path.basename(gz))

// Descompacta ao lado e confere antes de trocar.
fs.mkdirSync(path.dirname(BANCO), { recursive: true })
const novo = BANCO + '.restaurando'
let resumo
try {
  await pipeline(fs.createReadStream(gz), zlib.createGunzip(), fs.createWriteStream(novo))
  const t = new DatabaseSync(novo)
  const integro = Object.values(t.prepare('PRAGMA integrity_check').get())[0]
  if (integro !== 'ok') throw new Error('o banco do backup está com defeito')
  resumo = {
    lotes: t.prepare('SELECT COUNT(*) n FROM lotes').get().n,
    cartas: t.prepare('SELECT COUNT(*) n FROM cartas').get().n,
    vendidas: t.prepare("SELECT COUNT(*) n FROM cartas WHERE status = 'vendida'").get().n
  }
  t.close()
} catch (e) {
  fs.rmSync(novo, { force: true })
  sair('O backup não pôde ser usado: ' + e.message)
}

// Guarda o banco atual (se houver) antes de trocar.
const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(BANCO + ext)) fs.renameSync(BANCO + ext, `${BANCO}.antes-${carimbo}${ext}`)
}
fs.renameSync(novo, BANCO)
console.log(`✅ Banco restaurado: ${resumo.lotes} lote(s), ${resumo.cartas} carta(s), ${resumo.vendidas} vendida(s).`)

if (comFotos) {
  console.log('🖼️  Baixando as fotos (pode demorar um pouco)...')
  fs.mkdirSync(PASTA_FOTOS, { recursive: true })
  try {
    await rclone(['copy', juntar(destino, 'fotos'), PASTA_FOTOS, '--transfers=4'], { timeout: 4 * 60 * 60_000 })
    console.log('✅ Fotos restauradas.')
  } catch (e) {
    console.error('⚠️  Não consegui baixar as fotos: ' + e.message)
  }
}

console.log('\nPronto! Ligue o bot de novo. Se aparecer QR code, escaneie com o WhatsApp do número do bot.')
