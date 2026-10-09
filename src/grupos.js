// Grupos do bot: quais recebem as cartas, pausas e para onde cada carta vai.
import { db } from './db.js'

export const listarGruposDoBot = () => db.prepare('SELECT * FROM grupos ORDER BY pausado, COALESCE(nome, jid) COLLATE NOCASE').all()
export const gruposAtivos = () => listarGruposDoBot().filter(g => !g.pausado)
export const grupoDoBot = jid => db.prepare('SELECT * FROM grupos WHERE jid = ?').get(jid)
export const nomeGrupo = jid => grupoDoBot(jid)?.nome || 'grupo'

export function adicionarGrupo (jid, nome) {
  if (!jid || !String(jid).endsWith('@g.us')) return false
  db.prepare(`INSERT INTO grupos (jid, nome, pausado, adicionado_em) VALUES (?, ?, 0, ?)
    ON CONFLICT(jid) DO UPDATE SET nome = COALESCE(excluded.nome, grupos.nome)`).run(jid, nome || null, Date.now())
  return true
}

export const removerGrupo = jid => Number(db.prepare('DELETE FROM grupos WHERE jid = ?').run(jid).changes)
export const pausarGrupo = (jid, pausar) => Number(db.prepare('UPDATE grupos SET pausado = ? WHERE jid = ?').run(pausar ? 1 : 0, jid).changes)
export const renomearGrupo = (jid, nome) => { if (nome) db.prepare('UPDATE grupos SET nome = ? WHERE jid = ?').run(nome, jid) }

// Lê os grupos marcados num formulário. Devolve { destino, erro }:
// destino null = todos os grupos ativos; senão, JSON com a lista escolhida.
export function lerDestino (valor) {
  // O formulário manda "-" junto das caixinhas, para saber que o campo existia (tudo desmarcado = erro).
  const brutos = (valor === undefined ? [] : Array.isArray(valor) ? valor : [valor]).map(String)
  const marcados = brutos.filter(v => v !== '-')
  const ativos = gruposAtivos().map(g => g.jid)
  const escolhidos = [...new Set(marcados.filter(j => grupoDoBot(j)))]
  if (brutos.includes('-') && !marcados.length) return { destino: null, erro: 'Escolha pelo menos um grupo.' }
  if (!marcados.length || marcados.includes('todos')) return { destino: null, erro: ativos.length ? '' : 'Nenhum grupo ativo. Escolha ou retome um grupo em Conexão.' }
  if (!escolhidos.length) return { destino: null, erro: 'Escolha pelo menos um grupo.' }
  if (ativos.length && ativos.every(j => escolhidos.includes(j)) && escolhidos.every(j => ativos.includes(j))) return { destino: null, erro: '' }
  return { destino: JSON.stringify(escolhidos), erro: '' }
}

// Grupos de destino da carta que estão ativos agora (pausados ficam de fora).
export function alvosDaCarta (carta) {
  const ativos = gruposAtivos().map(g => g.jid)
  if (!carta?.destino) return ativos
  let lista = []
  try { lista = JSON.parse(carta.destino) } catch {}
  return ativos.filter(j => lista.includes(j))
}

export function descreverDestino (carta) {
  if (!carta?.destino) return 'todos os grupos ativos'
  let lista = []
  try { lista = JSON.parse(carta.destino) } catch {}
  return lista.map(nomeGrupo).join(', ') || 'nenhum grupo'
}

// Postagens de uma carta (uma por grupo).
export const postagensDa = cartaId => db.prepare('SELECT * FROM postagens WHERE carta_id = ? ORDER BY enviada_em').all(cartaId)

export function salvarPostagem (cartaId, grupo, fotoId, enqueteId, agora = Date.now()) {
  db.prepare(`INSERT INTO postagens (carta_id, grupo_jid, foto_msg_id, enquete_msg_id, enviada_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(carta_id, grupo_jid) DO UPDATE SET foto_msg_id = excluded.foto_msg_id, enquete_msg_id = excluded.enquete_msg_id, enviada_em = excluded.enviada_em`)
    .run(cartaId, grupo, fotoId || null, enqueteId || null, agora)
}

// Acha a carta de uma enquete (em qualquer grupo).
export function cartaDaEnquete (enqueteId) {
  if (!enqueteId) return undefined
  return db.prepare('SELECT c.* FROM postagens p JOIN cartas c ON c.id = p.carta_id WHERE p.enquete_msg_id = ?').get(enqueteId) ||
    db.prepare('SELECT * FROM cartas WHERE enquete_msg_id = ?').get(enqueteId)
}

// Horário automático: qual foi o último "fechar" ou "abrir" que já passou (olha até ontem).
// Horários no formato "23:00". Devolve { tipo: 'fechar' | 'abrir', quando: ms } ou null.
const lerHora = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? [+m[1], +m[2]] : null }
export function eventoDoHorario (agora, fechar, abrir) {
  const f = lerHora(fechar); const a = lerHora(abrir)
  if (!f || !a || (f[0] === a[0] && f[1] === a[1])) return null
  const t = agora instanceof Date ? agora.getTime() : agora
  const candidatos = []
  for (const dias of [0, -1]) {
    for (const [tipo, [h, m]] of [['fechar', f], ['abrir', a]]) {
      const d = new Date(t); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0)
      if (d.getTime() <= t) candidatos.push({ tipo, quando: d.getTime() })
    }
  }
  return candidatos.sort((x, y) => y.quando - x.quando)[0] || null
}
