// Divulgação: mensagens com texto e foto opcional para os grupos (agora, agendadas ou repetindo).
import { db } from './db.js'

export const REPETIR = { '': 'uma vez', diario: 'todo dia', semanal: 'toda semana' }

export function criarDivulgacao ({ texto = '', foto = null, destino = null, quando = null, repetir = '', autor = null }, agora = Date.now()) {
  return Number(db.prepare(`INSERT INTO divulgacoes (texto, foto, destino, proximo_em, repetir, status, criada_por, criada_em)
    VALUES (?, ?, ?, ?, ?, 'agendada', ?, ?)`)
    .run(String(texto).trim(), foto || null, destino || null, quando || agora, REPETIR[repetir] !== undefined ? repetir : '', autor, agora).lastInsertRowid)
}

// Próxima vez de uma divulgação que repete (pula as que passaram com o bot desligado).
export function proximaVez (desde, repetir, agora = Date.now()) {
  if (!repetir) return null
  const d = new Date(desde)
  do { d.setDate(d.getDate() + (repetir === 'semanal' ? 7 : 1)) } while (d.getTime() <= agora)
  return d.getTime()
}

export const pegarDivulgacao = id => db.prepare('SELECT * FROM divulgacoes WHERE id = ?').get(Number(id))
export const divulgacoesAgendadas = () => db.prepare("SELECT * FROM divulgacoes WHERE status IN ('agendada','enviando') ORDER BY proximo_em, id").all()
export const divulgacoesEnviadas = (n = 15) => db.prepare("SELECT * FROM divulgacoes WHERE status IN ('enviada','erro') ORDER BY COALESCE(ultimo_envio, criada_em) DESC, id DESC LIMIT ?").all(n)
export const contarAgendadas = () => db.prepare("SELECT COUNT(*) n FROM divulgacoes WHERE status IN ('agendada','enviando')").get().n

// Apaga e devolve o nome da foto, se ninguém mais usar (para apagar o arquivo).
export function apagarDivulgacao (id) {
  const d = pegarDivulgacao(id)
  if (!d) return { apagou: false }
  db.prepare('DELETE FROM divulgacoes WHERE id = ?').run(d.id)
  const emUso = d.foto && (db.prepare('SELECT 1 FROM divulgacoes WHERE foto = ?').get(d.foto) || db.prepare('SELECT 1 FROM cartas WHERE foto = ?').get(d.foto))
  return { apagou: true, foto: d.foto && !emUso ? d.foto : null }
}
