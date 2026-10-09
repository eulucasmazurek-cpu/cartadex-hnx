// Números da página de relatórios.
import { db, nomeContato } from './db.js'
import { SQL_A_RECEBER } from './cobranca.js'

export const PERIODOS = {
  7: { nome: '7 dias', dias: 7, grupo: 'dia' },
  30: { nome: '30 dias', dias: 30, grupo: 'dia' },
  90: { nome: '90 dias', dias: 90, grupo: 'semana' },
  tudo: { nome: 'Tudo', dias: null, grupo: 'mes' }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dois = n => String(n).padStart(2, '0')

function inicioDoDia (ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d }

// Início do balde (dia, semana começando na segunda, ou mês) de um horário.
function balde (ms, grupo) {
  const d = inicioDoDia(ms)
  if (grupo === 'semana') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (grupo === 'mes') d.setDate(1)
  return d
}

function proximo (d, grupo) {
  const n = new Date(d)
  if (grupo === 'dia') n.setDate(n.getDate() + 1)
  if (grupo === 'semana') n.setDate(n.getDate() + 7)
  if (grupo === 'mes') n.setMonth(n.getMonth() + 1)
  return n
}

function rotulo (d, grupo) {
  if (grupo === 'mes') return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`
}

// Primeiro instante do período (0 = desde sempre).
export function inicioDoPeriodo (chave, agora = Date.now()) {
  const per = PERIODOS[chave] || PERIODOS[30]
  return per.dias ? inicioDoDia(agora - (per.dias - 1) * 86_400_000).getTime() : 0
}

export function gerarRelatorio (chave = '30', agora = Date.now()) {
  const per = PERIODOS[chave] || PERIODOS[30]
  const desde = inicioDoPeriodo(chave, agora)

  const vendidas = db.prepare(`SELECT c.id, c.numero, c.lote_id, c.descricao, c.valor_venda, c.opcao_venda, c.vencedor, c.encerrada_em,
      (SELECT COUNT(*) FROM votos v WHERE v.carta_id = c.id) votos
    FROM cartas c WHERE c.status = 'vendida' AND c.encerrada_em >= ? AND c.fora_relatorio IS NULL ORDER BY c.encerrada_em`).all(desde)
  const semLance = db.prepare("SELECT COUNT(*) n FROM cartas WHERE status = 'sem_lance' AND encerrada_em >= ? AND fora_relatorio IS NULL").get(desde).n

  const total = vendidas.reduce((s, c) => s + (c.valor_venda || 0), 0)
  const arremates = vendidas.filter(c => c.opcao_venda === 3).length
  const encerradas = vendidas.length + semLance

  // A receber: vendidas ainda não pagas (sem remessa ou com remessa aguardando pagamento), qualquer período.
  const aReceber = db.prepare(SQL_A_RECEBER).get().v

  // Série temporal com baldes vazios preenchidos.
  const serie = []
  const primeiro = vendidas.length ? vendidas[0].encerrada_em : agora
  let d = balde(per.dias ? desde : primeiro, per.grupo)
  const fim = balde(agora, per.grupo).getTime()
  const indice = new Map()
  while (d.getTime() <= fim && serie.length < 400) {
    indice.set(d.getTime(), serie.length)
    serie.push({ rotulo: rotulo(d, per.grupo), total: 0, qtd: 0 })
    d = proximo(d, per.grupo)
  }
  for (const c of vendidas) {
    const i = indice.get(balde(c.encerrada_em, per.grupo).getTime())
    if (i === undefined) continue
    serie[i].total += c.valor_venda || 0
    serie[i].qtd++
  }

  const porLote = db.prepare(`SELECT l.id, l.nome,
      SUM(c.status = 'vendida') vendidas, SUM(c.status = 'sem_lance') sem_lance,
      COALESCE(SUM(CASE WHEN c.status = 'vendida' THEN c.valor_venda END), 0) total
    FROM lotes l JOIN cartas c ON c.lote_id = l.id
    WHERE c.status IN ('vendida','sem_lance') AND c.encerrada_em >= ? AND c.fora_relatorio IS NULL
    GROUP BY l.id ORDER BY total DESC LIMIT 15`).all(desde)

  const mapa = new Map()
  for (const c of vendidas) {
    const g = mapa.get(c.vencedor) || { jid: c.vencedor, qtd: 0, total: 0 }
    g.qtd++
    g.total += c.valor_venda || 0
    mapa.set(c.vencedor, g)
  }
  const compradores = [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 10)
    .map(g => ({ ...g, nome: nomeContato(g.jid) }))

  const disputadas = vendidas.filter(c => c.votos > 0).sort((a, b) => b.votos - a.votos || b.valor_venda - a.valor_venda).slice(0, 8)

  return {
    chave: PERIODOS[chave] ? chave : '30',
    periodo: per,
    total,
    qtd: vendidas.length,
    ticket: vendidas.length ? Math.round(total / vendidas.length) : 0,
    taxa: encerradas ? vendidas.length / encerradas : null,
    semLance,
    arremates,
    aReceber,
    serie,
    porLote,
    compradores,
    disputadas
  }
}
