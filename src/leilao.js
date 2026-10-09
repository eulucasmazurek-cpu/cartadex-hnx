// Regras do leilão: valores, opções da enquete, votos e apuração.
import { db, transacao, nomeContato } from './db.js'
import { talvezStrike } from './punicoes.js'

// Aceita "50", "50,00", "1.200,50", "R$ 75" e devolve centavos (ou null).
export function lerValor (texto) {
  if (texto === null || texto === undefined) return null
  let s = String(texto).replace(/r\$/i, '').replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export function moeda (centavos) {
  if (centavos === null || centavos === undefined) return ''
  return 'R$ ' + (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Valor sem "R$", para preencher campos do formulário.
export function valorCampo (centavos) {
  if (centavos === null || centavos === undefined) return ''
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Confere se a carta pode ir para o grupo. Devolve uma lista de problemas (vazia = ok).
export function problemasDaCarta (c) {
  const p = []
  const lances = [c.v1, c.v2, c.v3]
  if (lances.some(v => !v)) p.push('preencha os 3 valores')
  if (!c.arremate) p.push('preencha o arremate')
  if (lances.every(Boolean) && new Set(lances).size < 3) p.push('os 3 valores precisam ser diferentes')
  if (c.arremate && lances.every(Boolean) && c.arremate <= Math.max(...lances)) {
    p.push('o arremate precisa ser maior que os 3 valores')
  }
  return p
}

// Monta as 4 opções da enquete: 3 lances em ordem crescente + arremate.
export function opcoesDaCarta (c) {
  const lances = [c.v1, c.v2, c.v3].sort((a, b) => a - b)
  return [
    ...lances.map(v => ({ texto: moeda(v), valor: v, tipo: 'lance' })),
    { texto: `⚡ Arremate ${moeda(c.arremate)}`, valor: c.arremate, tipo: 'arremate' }
  ]
}

// Número da carta dentro do lote (#1, #2...). Cartas sem número usam o id.
export const numCarta = c => c?.numero ?? c?.id

export function nomeLote (loteId) {
  return db.prepare('SELECT nome FROM lotes WHERE id = ?').get(loteId)?.nome || ''
}

// Título da enquete: vai embaixo da foto (que sai sem legenda), com lote, número e descrição.
// O WhatsApp aceita até 255 caracteres no título; o que passar disso é cortado com "...".
export const LIMITE_TITULO = 255
export function tituloEnquete (c) {
  const lote = nomeLote(c.lote_id)
  const cabeca = `🃏 ${lote ? `${lote}, carta` : 'Carta'} #${numCarta(c)}`
  const desc = (c.descricao || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  const t = desc ? `${cabeca}\n${desc}` : cabeca
  return [...t].length > LIMITE_TITULO ? [...t].slice(0, LIMITE_TITULO - 3).join('').trimEnd() + '...' : t
}

// Peso de cada opção: o arremate vale mais que qualquer lance; entre lances, vence o maior valor.
function peso (opcao) {
  return (opcao.tipo === 'arremate' ? 1e12 : 0) + opcao.valor
}

// Apuração: maior opção votada; empate -> quem votou primeiro.
// votos: [{ votante, opcao, ts }]   opcoes: saída de opcoesDaCarta
export function calcularVencedor (votos, opcoes) {
  let melhor = null
  for (const v of votos) {
    const op = opcoes[v.opcao]
    if (!op) continue
    const atual = { votante: v.votante, opcao: v.opcao, valor: op.valor, tipo: op.tipo, ts: v.ts, peso: peso(op) }
    if (!melhor || atual.peso > melhor.peso || (atual.peso === melhor.peso && atual.ts < melhor.ts)) {
      melhor = atual
    }
  }
  if (!melhor) return null
  const { peso: _, ...r } = melhor
  return r
}

// Registra (ou remove, se opcao for null) o voto de uma pessoa.
// Se a pessoa votar de novo na MESMA opção, mantém o horário original.
// Retirar o voto depois do prazo dá strike (mudar de opção não dá).
// Votos chegam fora de ordem às vezes (celular sem sinal, reconexão): uma mudança mais antiga
// que a última já registrada (voto ou retirada) é ignorada.
db.exec(`CREATE TABLE IF NOT EXISTS votos_retirados (
  carta_id INTEGER NOT NULL,
  votante  TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  PRIMARY KEY (carta_id, votante)
)`)

export function registrarVoto (cartaId, votante, opcao, ts) {
  const atual = db.prepare('SELECT opcao, ts, alterado FROM votos WHERE carta_id = ? AND votante = ?').get(cartaId, votante)
  const retirado = db.prepare('SELECT ts FROM votos_retirados WHERE carta_id = ? AND votante = ?').get(cartaId, votante)
  const ultimo = Math.max(atual?.alterado ?? atual?.ts ?? 0, retirado?.ts ?? 0)
  if (ts < ultimo) return null
  if (opcao === null || opcao === undefined) {
    db.prepare(`INSERT INTO votos_retirados (carta_id, votante, ts) VALUES (?, ?, ?)
      ON CONFLICT(carta_id, votante) DO UPDATE SET ts = excluded.ts`).run(cartaId, votante, ts)
    db.prepare('DELETE FROM votos WHERE carta_id = ? AND votante = ?').run(cartaId, votante)
    return atual ? talvezStrike(cartaId, votante, atual, ts) : null
  }
  if (atual && atual.opcao === opcao) {
    db.prepare('UPDATE votos SET alterado = ? WHERE carta_id = ? AND votante = ?').run(ts, cartaId, votante)
    return
  }
  db.prepare(`INSERT INTO votos (carta_id, votante, opcao, ts, alterado) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(carta_id, votante) DO UPDATE SET opcao = excluded.opcao, ts = excluded.ts, alterado = excluded.alterado`)
    .run(cartaId, votante, opcao, ts, ts)
}

// Votos que valem (quem está bloqueado fica de fora enquanto estiver bloqueado).
export function votosDaCarta (cartaId) {
  return db.prepare(`SELECT votante, opcao, ts FROM votos WHERE carta_id = ?
    AND votante NOT IN (SELECT votante FROM bloqueados) ORDER BY ts`).all(cartaId)
}

export function liderAtual (carta) {
  if (!carta.opcoes) return null
  return calcularVencedor(votosDaCarta(carta.id), JSON.parse(carta.opcoes))
}

// Encerra as cartas indicadas (só as que estão no ar) e devolve o resultado de cada uma.
export function encerrarCartas (ids, agora = Date.now()) {
  if (!ids.length) return []
  return transacao(() => {
    const resultados = []
    for (const id of ids) {
      const c = db.prepare("SELECT * FROM cartas WHERE id = ? AND status = 'no_ar'").get(id)
      if (!c) continue
      // Só valem votos feitos até a hora marcada para encerrar.
      const limite = c.encerra_em && c.encerra_em < agora ? c.encerra_em : agora
      const venc = calcularVencedor(votosDaCarta(c.id).filter(v => v.ts <= limite), JSON.parse(c.opcoes || '[]'))
      if (venc) {
        db.prepare(`UPDATE cartas SET status = 'vendida', vencedor = ?, valor_venda = ?, opcao_venda = ?, encerrada_em = ?
          WHERE id = ?`).run(venc.votante, venc.valor, venc.tipo === 'arremate' ? 3 : venc.opcao, agora, c.id)
      } else {
        db.prepare("UPDATE cartas SET status = 'sem_lance', encerrada_em = ? WHERE id = ?").run(agora, c.id)
      }
      resultados.push({ carta: c, vencedor: venc })
    }
    return resultados
  })
}

// Texto do resultado para o grupo, com menção a quem ganhou.
export function textoResultado (resultados) {
  const vendidas = resultados.filter(r => r.vencedor)
  const sem = resultados.filter(r => !r.vencedor)
  const linhas = ['🏆 *Leilão encerrado!*']
  const mencoes = []
  // Agrupa por lote, porque cada lote tem a sua numeração.
  const lotes = [...new Set(resultados.map(r => r.carta.lote_id))]
  for (const loteId of lotes) {
    const doLote = vendidas.filter(r => r.carta.lote_id === loteId)
    const semDoLote = sem.filter(r => r.carta.lote_id === loteId)
    const nome = nomeLote(loteId)
    linhas.push('')
    if (nome) linhas.push(`*${nome}*`)
    for (const r of doLote) {
      const jid = r.vencedor.votante
      if (!mencoes.includes(jid)) mencoes.push(jid)
      const tipo = r.vencedor.tipo === 'arremate' ? ' (arremate)' : ''
      linhas.push(`#${numCarta(r.carta)}: @${jid.split('@')[0]} — ${moeda(r.vencedor.valor)}${tipo}`)
    }
    if (!doLote.length) linhas.push('Nenhuma carta recebeu lance desta vez.')
    if (semDoLote.length) linhas.push(`Sem lance: ${semDoLote.map(r => '#' + numCarta(r.carta)).join(', ')}`)
  }
  if (vendidas.length) linhas.push('', 'Ganhadores, chamem no privado para combinar o pagamento. 💬')
  return { texto: linhas.join('\n'), mencoes }
}

export function descreverVencedor (c) {
  if (!c.vencedor) return ''
  return `${nomeContato(c.vencedor)} — ${moeda(c.valor_venda)}${c.opcao_venda === 3 ? ' (arremate)' : ''}`
}
