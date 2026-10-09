// Verificação de membros: sinais de risco (golpe/spam) de cada membro dos grupos do leilão.
// Não existe lista pública de golpistas: são sinais para a equipe olhar, não prova.
import { db, cfg, setCfg, registrarAtividade, nomeContato } from './db.js'
import './punicoes.js' // cria as tabelas de strikes e bloqueios

db.exec(`CREATE TABLE IF NOT EXISTS membros (
  grupo_jid TEXT NOT NULL,
  jid       TEXT NOT NULL,           -- identificador usado pelo bot (número ou LID)
  id_wa     TEXT NOT NULL,           -- como o WhatsApp manda (para remover do grupo)
  telefone  TEXT,                    -- só os dígitos, quando o WhatsApp mostra
  admin     INTEGER NOT NULL DEFAULT 0,
  entrou_em INTEGER,                 -- quando o bot viu a pessoa entrar
  visto_em  INTEGER NOT NULL,
  PRIMARY KEY (grupo_jid, jid)
);
CREATE TABLE IF NOT EXISTS sinais_spam (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  jid    TEXT NOT NULL,
  grupo  TEXT,
  ts     INTEGER NOT NULL,
  trecho TEXT
);
CREATE INDEX IF NOT EXISTS idx_spam_jid ON sinais_spam(jid);
CREATE TABLE IF NOT EXISTS confiaveis (
  jid  TEXT PRIMARY KEY,
  por  TEXT,
  desde INTEGER NOT NULL
);`)

// DDDs que existem no Brasil.
const DDDS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99])

const LINK = /(https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|bit\.ly\/|t\.me\/|tinyurl\.|encurtador)/i
const PROPAGANDA = /(renda extra|ganhe (r\$|dinheiro|at[eé])|lucro garantido|investimento|investir|trader|forex|cripto|bitcoin|aposta|\bbet\b|cassino|tigrinho|empr[eé]stimo|cart[aã]o clonado|clique no link|seguidores|curtidas|vagas? de emprego)/i
const NOME_SUSPEITO = /(suporte|whats ?app|oficial|admin|promo|ganhe|renda|invest|trader|bet|cassino|banco|pix|empr[eé]stimo)/i

// O texto parece golpe/propaganda? Devolve o motivo ou ''.
export function textoSuspeito (texto) {
  const t = String(texto || '')
  if (/chat\.whatsapp\.com\//i.test(t)) return 'convite para outro grupo'
  if (LINK.test(t)) return 'link'
  const m = PROPAGANDA.exec(t)
  return m ? `propaganda ("${m[0].toLowerCase()}")` : ''
}

export function registrarSpam (jid, grupo, texto, ts = Date.now()) {
  db.prepare('INSERT INTO sinais_spam (jid, grupo, ts, trecho) VALUES (?, ?, ?, ?)').run(jid, grupo, ts, String(texto).slice(0, 160))
}

// Avalia um membro. Devolve { pontos, nivel: 'alto' | 'atencao' | 'ok', motivos: [] }.
export function avaliar ({ telefone, nome, entrou_em: entrou, bloqueado = false, strikes = 0, spam = 0 }, agora = Date.now()) {
  const motivos = []
  let pontos = 0
  const add = (p, m) => { pontos += p; motivos.push(m) }
  const num = String(telefone || '').replace(/\D/g, '')
  if (!num) motivos.push('número escondido pelo WhatsApp')
  else if (!num.startsWith('55')) add(3, `número de fora do Brasil (+${num})`)
  else {
    const ddd = Number(num.slice(2, 4)); const resto = num.slice(4)
    if (!DDDS.has(ddd)) add(3, `DDD ${ddd} não existe`)
    else if (resto.length === 8 && !/^[6-9]/.test(resto)) add(1, 'número fixo (comum em contas de empresa ou robô)')
    else if (resto.length !== 8 && resto.length !== 9) add(2, 'número com formato estranho')
  }
  if (bloqueado) add(4, 'bloqueado no CartaDex')
  else if (strikes) add(Math.min(2, strikes), `${strikes} strike${strikes === 1 ? '' : 's'} no leilão`)
  if (spam) add(Math.min(6, 3 * spam), `mandou link ou propaganda no grupo${spam > 1 ? ` (${spam} vezes)` : ''}`)
  if (nome && NOME_SUSPEITO.test(nome)) add(2, `nome suspeito ("${nome}")`)
  if (entrou && agora - entrou < 3 * 86400_000) add(1, 'entrou no grupo há menos de 3 dias')
  return { pontos, nivel: pontos >= 4 ? 'alto' : pontos >= 2 ? 'atencao' : 'ok', motivos }
}

// Guarda a lista de membros de um grupo (vinda do WhatsApp).
export function salvarMembros (grupo, lista, agora = Date.now()) {
  const st = db.prepare(`INSERT INTO membros (grupo_jid, jid, id_wa, telefone, admin, visto_em) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(grupo_jid, jid) DO UPDATE SET id_wa = excluded.id_wa, telefone = COALESCE(excluded.telefone, membros.telefone), admin = excluded.admin, visto_em = excluded.visto_em`)
  for (const m of lista) st.run(grupo, m.jid, m.id_wa, m.telefone || null, m.admin ? 1 : 0, agora)
  // Quem saiu do grupo sai da lista.
  db.prepare('DELETE FROM membros WHERE grupo_jid = ? AND visto_em < ?').run(grupo, agora)
}

export function registrarEntrada (grupo, m, agora = Date.now()) {
  db.prepare(`INSERT INTO membros (grupo_jid, jid, id_wa, telefone, admin, entrou_em, visto_em) VALUES (?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(grupo_jid, jid) DO UPDATE SET entrou_em = excluded.entrou_em, visto_em = excluded.visto_em, telefone = COALESCE(excluded.telefone, membros.telefone)`)
    .run(grupo, m.jid, m.id_wa, m.telefone || null, agora, agora)
  return avaliarJid(m.jid, agora)
}

export const removerMembro = (grupo, jid) => db.prepare('DELETE FROM membros WHERE grupo_jid = ? AND jid = ?').run(grupo, jid)
export const marcarConfiavel = (jid, por) => db.prepare('INSERT OR REPLACE INTO confiaveis (jid, por, desde) VALUES (?, ?, ?)').run(jid, por || null, Date.now())
export const tirarConfiavel = jid => db.prepare('DELETE FROM confiaveis WHERE jid = ?').run(jid)

function dadosDe (jid) {
  const linhas = db.prepare('SELECT * FROM membros WHERE jid = ?').all(jid)
  const contato = db.prepare('SELECT nome, telefone FROM contatos WHERE jid = ?').get(jid) || {}
  const telefone = linhas.find(l => l.telefone)?.telefone || String(contato.telefone || '').replace(/\D/g, '') || (jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : '')
  return {
    jid,
    telefone,
    nome: contato.nome || '',
    entrou_em: Math.max(0, ...linhas.map(l => l.entrou_em || 0)) || null,
    admin: linhas.some(l => l.admin),
    grupos: linhas.map(l => ({ jid: l.grupo_jid, id_wa: l.id_wa, admin: l.admin })),
    bloqueado: Boolean(db.prepare('SELECT 1 FROM bloqueados WHERE votante = ?').get(jid)),
    strikes: db.prepare('SELECT COUNT(*) n FROM strikes WHERE votante = ?').get(jid).n,
    spam: db.prepare('SELECT COUNT(*) n FROM sinais_spam WHERE jid = ?').get(jid).n,
    ultimoSpam: db.prepare('SELECT trecho, ts FROM sinais_spam WHERE jid = ? ORDER BY id DESC LIMIT 1').get(jid) || null,
    confiavel: Boolean(db.prepare('SELECT 1 FROM confiaveis WHERE jid = ?').get(jid))
  }
}

export function avaliarJid (jid, agora = Date.now()) {
  const d = dadosDe(jid)
  return { ...d, ...avaliar(d, agora) }
}

// Lista para a tela: todos os membros avaliados (admins e confiáveis não entram nos alertas).
export function listarRiscos (agora = Date.now()) {
  const jids = db.prepare('SELECT DISTINCT jid FROM membros').all().map(r => r.jid)
  const todos = jids.map(j => avaliarJid(j, agora))
  const alerta = todos.filter(m => !m.admin && !m.confiavel && m.nivel !== 'ok').sort((a, b) => b.pontos - a.pontos)
  return {
    total: todos.length,
    alto: alerta.filter(m => m.nivel === 'alto'),
    atencao: alerta.filter(m => m.nivel === 'atencao'),
    confiaveis: todos.filter(m => m.confiavel),
    escondidos: todos.filter(m => !m.telefone).length,
    ultima: Number(cfg('seguranca_ultima')) || null
  }
}

// Lê os membros de todos os grupos do leilão. wa.membrosDoGrupo(jid) vem do WhatsApp.
export async function verificarMembros (wa, grupos, agora = Date.now()) {
  let n = 0; const falhas = []
  for (const g of grupos) {
    try {
      const lista = await wa.membrosDoGrupo(g.jid)
      salvarMembros(g.jid, lista, agora)
      n += lista.length
    } catch (e) { falhas.push(`${g.nome || g.jid}: ${e.message}`) }
  }
  setCfg('seguranca_ultima', agora)
  const r = listarRiscos(agora)
  registrarAtividade('CartaDex', 'acao', `Verificou ${n} membro(s): ${r.alto.length} de alto risco, ${r.atencao.length} para atenção`)
  return { membros: n, falhas, alto: r.alto.length, atencao: r.atencao.length }
}

export { nomeContato }
