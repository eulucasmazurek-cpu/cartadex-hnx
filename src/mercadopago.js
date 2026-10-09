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
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }] }
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

// Devolve o pagamento aprovado dessa referência (que passe no filtro, se houver), ou null.
export async function pagamentoAprovado (referencia, filtro = () => true) {
  const j = await chamar('GET', `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc&limit=30`)
  return (j.results || []).find(p => p.status === 'approved' && filtro(p)) || null
}

// Para o botão "Testar": confere o token e devolve o nome da conta.
export async function contaMP () {
  const j = await chamar('GET', '/users/me')
  return j.nickname || j.email || String(j.id || 'conta')
}
