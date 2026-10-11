// Mercado Pago: cria o link de pagamento (Pix e cartão) e confere se foi pago.
// Usa o Access Token de produção da conta (Configurações → Mensagem para o ganhador).
import crypto from 'node:crypto'
import { cfg } from './db.js'
import { numCarta } from './leilao.js'

const BASE = 'https://api.mercadopago.com'
let _fetch = (...a) => fetch(...a)
export function _usarFetch (f) { _fetch = f }

export const tokenMP = () => String(cfg('mp_token') || '').trim()
export const temMP = () => Boolean(tokenMP())

async function chamar (metodo, caminho, corpo) {
  const token = tokenMP()
  if (!token) throw new Error('Mercado Pago não configurado')
  let r
  try {
    r = await _fetch(BASE + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(metodo === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {})
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000)
    })
  } catch (e) {
    throw new Error(`sem resposta do Mercado Pago (${e.name === 'TimeoutError' ? 'demorou demais' : e.message})`)
  }
  const texto = await r.text()
  let j = {}
  try { j = JSON.parse(texto) } catch {}
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error('o Access Token do Mercado Pago é inválido ou não tem permissão')
    throw new Error(`Mercado Pago respondeu ${r.status}: ${String(j.message || j.error || texto).slice(0, 150)}`)
  }
  return j
}

const primeiraLinha = t => String(t || '').split('\n')[0].trim()

// Endereço público do painel (ex.: https://painel.seudominio.com.br). Com ele, cada link de pagamento
// pede ao Mercado Pago para avisar o bot na hora em que o pagamento cair.
export function urlDoAviso () {
  const base = String(cfg('endereco_publico') || '').trim().replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+$/i.test(base) ? `${base}/mp/aviso?source_news=webhooks` : null
}

// Link de pagamento com as cartas como itens. Boleto fica de fora (demora dias para cair).
export async function criarLinkMP ({ referencia, cartas }) {
  const j = await chamar('POST', '/checkout/preferences', {
    items: cartas.map(c => ({
      id: String(c.id),
      title: `Carta #${numCarta(c)}${primeiraLinha(c.descricao) ? ' ' + primeiraLinha(c.descricao) : ''}`.slice(0, 250),
      quantity: 1,
      unit_price: Math.round(c.valor_venda) / 100,
      currency_id: 'BRL'
    })),
    external_reference: referencia,
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }] },
    ...(urlDoAviso() ? { notification_url: urlDoAviso() } : {})
  })
  if (!j.init_point) throw new Error('o Mercado Pago não devolveu o link')
  return { id: j.id, link: j.init_point }
}

// Faz um link de pagamento antigo parar de aceitar pagamento.
export async function expirarLinkMP (prefId) {
  if (!prefId) return
  await chamar('PUT', `/checkout/preferences/${encodeURIComponent(prefId)}`, {
    expires: true,
    expiration_date_to: new Date(Date.now() - 60_000).toISOString()
  })
}

// Todos os pagamentos de uma referência (mais novos primeiro): aprovados, Pix esperando, cancelados...
export async function pagamentosDaReferencia (referencia) {
  const j = await chamar('GET', `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc&limit=30`)
  return j.results || []
}

// Devolve o pagamento aprovado dessa referência (que passe no filtro, se houver), ou null.
export async function pagamentoAprovado (referencia, filtro = () => true) {
  return (await pagamentosDaReferencia(referencia)).find(p => p.status === 'approved' && filtro(p)) || null
}

// Cancela um pagamento que ainda não foi pago (o QR code / copia e cola do Pix para de funcionar).
export async function cancelarPagamentoMP (id) {
  await chamar('PUT', `/v1/payments/${encodeURIComponent(id)}`, { status: 'cancelled' })
}

// Um pagamento pelo número dele (usado quando o Mercado Pago avisa), ou null se não existir.
export async function pagamentoPorId (id) {
  try {
    return await chamar('GET', `/v1/payments/${encodeURIComponent(id)}`)
  } catch (e) {
    if (/respondeu 404/.test(e.message)) return null
    throw e
  }
}

// Para o botão "Testar": confere o token e devolve o nome da conta.
export async function contaMP () {
  const j = await chamar('GET', '/users/me')
  return j.nickname || j.email || String(j.id || 'conta')
}
