// Mural: junta as fotos das cartas ganhas numa imagem só (grade com número e valor embaixo de cada uma).
// Usa o ImageMagick do servidor (sudo apt install imagemagick). Sem ele, o bot manda uma foto por carta.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { PASTA_DADOS, PASTA_FOTOS } from './db.js'
import { moeda, numCarta } from './leilao.js'

const FONTES = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
let programa = process.env.MONTAGE || null // descoberto na primeira vez

function rodar (cmd, args, timeout = 90_000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => err ? reject(Object.assign(err, { stderr: String(stderr || '') })) : resolve(String(stdout || '')))
  })
}

// ImageMagick 6 tem "montage"; o 7 tem "magick montage".
async function acharMontage () {
  if (programa) return programa
  for (const cand of [['montage'], ['magick', 'montage']]) {
    try { await rodar(cand[0], [...cand.slice(1), '-version'], 10_000); programa = cand; return cand } catch {}
  }
  return null
}
export const temMural = async () => Boolean(await acharMontage())
export function _usarMontage (cmd) { programa = cmd }

export const colunasDoMural = n => n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4

// Monta o mural das cartas (até 16 por imagem) e devolve o caminho do arquivo, ou null se não der.
export async function montarMural (cartas) {
  const comFoto = cartas.filter(c => c.foto && fs.existsSync(path.join(PASTA_FOTOS, c.foto))).slice(0, 16)
  if (comFoto.length < 2) return null
  const cmd = await acharMontage()
  if (!cmd) return null
  const pasta = path.join(PASTA_DADOS, 'tmp')
  fs.mkdirSync(pasta, { recursive: true })
  const saida = path.join(pasta, `mural-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`)
  const fonte = FONTES.find(f => fs.existsSync(f))
  const args = [...cmd.slice(1)]
  for (const c of comFoto) {
    // No ImageMagick, % no texto do rótulo precisa ser dobrado.
    args.push('-label', `#${numCarta(c)}  ${moeda(c.valor_venda)}`.replaceAll('%', '%%'), path.join(PASTA_FOTOS, c.foto))
  }
  const col = colunasDoMural(comFoto.length)
  args.push('-tile', `${col}x`, '-geometry', '420x588>+14+14', '-background', '#131418', '-fill', '#f2c218', '-pointsize', '30')
  if (fonte) args.push('-font', fonte)
  args.push('-auto-orient', '-quality', '85', saida)
  try {
    await rodar(cmd[0], args)
    return fs.existsSync(saida) ? saida : null
  } catch (e) {
    console.error('Não consegui montar o mural:', (e.stderr || e.message).slice(0, 200))
    return null
  }
}

export function apagarDepois (arquivo, ms = 120_000) {
  if (arquivo) setTimeout(() => fs.rm(arquivo, { force: true }, () => {}), ms).unref?.()
}
