// Aviso de "bot fora do ar".
// O bot não consegue avisar que caiu (se o notebook desliga, ele desliga junto). Por isso quem avisa é um
// serviço de fora, como o Healthchecks.io: a cada minuto o bot manda um "estou vivo" para lá. Se os sinais
// param de chegar (notebook desligado, internet caiu, bot travou), o serviço manda o aviso para o seu e-mail
// ou celular. Quando o bot está ligado mas com problema (WhatsApp desconectado, túnel da Cloudflare parado),
// ele mesmo manda um sinal de "falha" com o motivo.
import { execFile } from 'node:child_process'
import { cfg } from './db.js'

let _fetch = (...a) => fetch(...a)
export function _usarFetch (f) { _fetch = f }
let _tunel = () => estadoDoTunel()
export function _usarTunel (f) { _tunel = f }

export const INTERVALO = 60_000
export const TOLERANCIA_WHATS = 3 * 60_000 // reconexões rápidas do WhatsApp não contam como problema

// Endereço de "estou vivo" (ex.: https://hc-ping.com/xxxxxxxx-...). Só https.
export function urlMonitor () {
  const u = String(cfg('monitor_url') || '').trim().replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s"'<>]*$/i.test(u) ? u : null
}

// Túnel da Cloudflare: true (ligado), false (parado) ou null (não instalado aqui / não deu para ver).
export function estadoDoTunel () {
  return new Promise(resolve => {
    execFile('systemctl', ['show', 'cloudflared', '-p', 'LoadState', '-p', 'ActiveState'], { timeout: 5000 }, (erro, saida) => {
      if (erro) return resolve(null)
      const v = Object.fromEntries(String(saida).trim().split('\n').map(l => l.split('=')))
      if (v.LoadState !== 'loaded') return resolve(null)
      resolve(v.ActiveState === 'active' || v.ActiveState === 'reloading' || v.ActiveState === 'activating')
    })
  })
}

export const estado = { desconectadoDesde: null, ultimo: null } // ultimo: { ts, ok, texto, erro }

const minutos = ms => Math.max(1, Math.round(ms / 60_000))

// O que está errado agora (lista vazia = tudo certo).
export async function problemas (wa, agora = Date.now()) {
  const lista = []
  if (wa?.estado?.conectado) estado.desconectadoDesde = null
  else {
    estado.desconectadoDesde ??= agora
    const ha = agora - estado.desconectadoDesde
    if (ha >= TOLERANCIA_WHATS) lista.push(`WhatsApp desconectado há ${minutos(ha)} min${wa?.estado?.qr ? ' (pedindo para ler o QR code de novo)' : ''}`)
  }
  if (await _tunel() === false) lista.push('Túnel da Cloudflare parado: o painel não abre de fora de casa')
  return lista
}

// Manda um sinal. Devolve o que foi mandado (para o painel mostrar).
export async function sinalizar (wa, agora = Date.now()) {
  const url = urlMonitor()
  if (!url) return null
  const lista = await problemas(wa, agora)
  const ok = !lista.length
  const texto = ok ? 'Tudo certo: bot ligado, WhatsApp conectado.' : 'Problema no CartaDex:\n- ' + lista.join('\n- ')
  let erro = ''
  try {
    const r = await _fetch(ok ? url : url + '/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: texto,
      signal: AbortSignal.timeout(10_000)
    })
    if (!r.ok) erro = r.status === 404 ? 'o serviço não reconheceu esse endereço (confira se copiou inteiro)' : `o serviço respondeu ${r.status}`
  } catch (e) {
    erro = `sem resposta do serviço (${e.name === 'TimeoutError' ? 'demorou demais' : e.message})`
  }
  estado.ultimo = { ts: agora, ok, texto, erro }
  if (erro) console.error('Aviso de fora do ar:', erro)
  return estado.ultimo
}

// Para a tela de Configurações.
export function resumoMonitor () {
  const u = estado.ultimo
  if (!urlMonitor()) return { ligado: false }
  if (!u) return { ligado: true, texto: 'Ligado. O primeiro sinal sai em até 1 minuto.' }
  const hora = new Date(u.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (u.erro) return { ligado: true, ruim: true, texto: `Último sinal às ${hora} não chegou: ${u.erro}.` }
  return { ligado: true, ruim: !u.ok, texto: u.ok ? `Último sinal às ${hora}: tudo certo.` : `Último sinal às ${hora}: avisou problema (${u.texto.split('\n- ').slice(1).join('; ')}).` }
}

let timer = null
export function iniciarMonitor (wa) {
  if (timer) return
  const volta = () => sinalizar(wa).catch(e => console.error('Aviso de fora do ar:', e.message))
  setTimeout(volta, 15_000).unref?.() // dá tempo de o WhatsApp conectar depois de ligar
  timer = setInterval(volta, INTERVALO)
  timer.unref?.()
}
