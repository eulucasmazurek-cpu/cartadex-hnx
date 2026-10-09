// Gerenciador de links: nos grupos do leilão, só administradores, números autorizados
// e sites liberados podem mandar link. Os outros links são apagados pelo bot.
import { db, cfg, registrarAtividade, nomeContato } from './db.js'

db.exec(`CREATE TABLE IF NOT EXISTS autorizados_link (
  chave TEXT PRIMARY KEY,        -- telefone (só dígitos) ou identificador do WhatsApp
  nome  TEXT,
  por   TEXT,
  desde INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS links_apagados (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  jid    TEXT NOT NULL,
  grupo  TEXT,
  trecho TEXT,
  ok     INTEGER NOT NULL,          -- 1 = apagou; 0 = não conseguiu
  erro   TEXT
);`)

const TERMINACOES = 'com|net|org|br|io|me|ly|gg|xyz|app|store|shop|site|online|link|info|co|tv|vip|top|click|live|pro|club|bet'
const ACHAR = new RegExp(`(?:https?:\\/\\/[^\\s]+|www\\.[^\\s]+|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TERMINACOES})(?:\\.br)?\\b(?:\\/[^\\s]*)?)`, 'gi')

// Endereços (hosts) dos links de um texto. Vazio = não tem link.
export function linksDoTexto (texto) {
  const achados = String(texto || '').match(ACHAR) || []
  return achados.map(l => {
    const h = l.replace(/^https?:\/\//i, '').split(/[/?#:]/)[0].toLowerCase().replace(/^www\./, '')
    return h
  }).filter(h => h.includes('.'))
}

const digitos = t => String(t || '').replace(/\D/g, '')

// Sites que qualquer um pode mandar (ex.: o site da loja).
export function dominiosLiberados () {
  return String(cfg('links_dominios') || '').split(/[\s,;]+/).map(d => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean)
}

export function estaAutorizado (jid, telefone) {
  const chaves = [jid, digitos(telefone), jid?.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : ''].filter(Boolean)
  return chaves.some(c => db.prepare('SELECT 1 FROM autorizados_link WHERE chave = ?').get(c))
}

// Decide o que fazer com uma mensagem. Devolve { apagar: bool, motivo }.
export function decidirLink ({ texto, jid, telefone, admin = false }) {
  if (cfg('links_ativo') !== '1') return { apagar: false, motivo: 'desligado' }
  const hosts = linksDoTexto(texto)
  if (!hosts.length) return { apagar: false, motivo: 'sem link' }
  if (admin) return { apagar: false, motivo: 'administrador' }
  if (estaAutorizado(jid, telefone)) return { apagar: false, motivo: 'autorizado' }
  const liberados = dominiosLiberados()
  if (hosts.every(h => liberados.some(d => h === d || h.endsWith('.' + d)))) return { apagar: false, motivo: 'site liberado' }
  return { apagar: true, motivo: `link de ${hosts.join(', ')}` }
}

export function autorizar (telefoneOuJid, nome, por) {
  let chave = telefoneOuJid.includes('@') ? telefoneOuJid : digitos(telefoneOuJid)
  if (!chave.includes('@') && (chave.length === 10 || chave.length === 11)) chave = '55' + chave
  db.prepare('INSERT OR REPLACE INTO autorizados_link (chave, nome, por, desde) VALUES (?, ?, ?, ?)').run(chave, nome || null, por || null, Date.now())
  return chave
}
export const desautorizar = chave => db.prepare('DELETE FROM autorizados_link WHERE chave = ?').run(chave)
export const listarAutorizados = () => db.prepare('SELECT * FROM autorizados_link ORDER BY desde DESC').all()

export function registrarApagado (jid, grupo, texto, ok, erro = null) {
  db.prepare('INSERT INTO links_apagados (ts, jid, grupo, trecho, ok, erro) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), jid, grupo, String(texto).slice(0, 200), ok ? 1 : 0, erro)
  if (!ok) registrarAtividade('CartaDex', 'acao', `Não consegui apagar um link de ${nomeContato(jid)}: ${erro}`.slice(0, 290))
}
export const ultimosApagados = (n = 30) => db.prepare('SELECT * FROM links_apagados ORDER BY id DESC LIMIT ?').all(n)
export const apagadosHoje = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return db.prepare('SELECT COUNT(*) n FROM links_apagados WHERE ok = 1 AND ts >= ?').get(h.getTime()).n }
