// Login do painel com sessão (cookie), senha trocada pelo próprio painel e código de acesso pelo WhatsApp.
// As senhas do .env continuam valendo até a pessoa criar uma nova; a nova fica guardada só como hash.
import crypto from 'node:crypto'
import { db, cfg } from './db.js'

db.exec(`CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  login      TEXT NOT NULL,
  criada_em  INTEGER NOT NULL,
  expira_em  INTEGER NOT NULL,
  visto_em   INTEGER,
  ip         TEXT,
  aparelho   TEXT
);
CREATE TABLE IF NOT EXISTS senhas (
  login     TEXT PRIMARY KEY,
  hash      TEXT NOT NULL,
  trocada_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios_whats (
  login    TEXT PRIMARY KEY,
  telefone TEXT
);
CREATE TABLE IF NOT EXISTS codigos_acesso (
  login      TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  criado_em  INTEGER NOT NULL,
  expira_em  INTEGER NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pedidos_codigo (
  login TEXT NOT NULL,
  ts    INTEGER NOT NULL
);`)

export const COOKIE = 'cdx_sessao'
// Marca visível para o navegador (sem segredo nenhum): as páginas do painel conferem se ela existe antes de aparecer.
// Se a pessoa saiu, qualquer cópia guardada do painel some na hora e vai para o login.
export const MARCA = 'cdx_on'
export const DIAS_LEMBRAR = 30
export const HORAS_SEM_LEMBRAR = 12
export const MINUTOS_CODIGO = 10
export const TENTATIVAS_CODIGO = 5
export const PEDIDOS_POR_HORA = 3
export const SENHA_MINIMA = 8

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
function igual (x, y) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(x)).digest(), crypto.createHash('sha256').update(String(y)).digest())
}

// ---------- Senhas ----------
function hashSenha (senha) {
  const sal = crypto.randomBytes(16)
  const h = crypto.scryptSync(String(senha), sal, 32)
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`
}
// Conferência assíncrona: não trava o bot (WhatsApp e leilões) enquanto calcula.
const scrypt = (senha, sal) => new Promise((resolve, reject) => crypto.scrypt(String(senha), sal, 32, (e, k) => e ? reject(e) : resolve(k)))
async function confereHash (senha, guardado) {
  const [tipo, sal, h] = String(guardado).split('$')
  if (tipo !== 'scrypt' || !sal || !h) return false
  const calc = await scrypt(senha, Buffer.from(sal, 'hex'))
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'))
}
const HASH_FALSO = hashSenha(crypto.randomBytes(12).toString('hex'))

export const temSenhaNova = login => Boolean(db.prepare('SELECT 1 FROM senhas WHERE login = ?').get(login))

// Senha certa para este usuário? Vale a senha criada no painel; sem ela, a do .env.
export async function senhaValida (usuario, senha) {
  if (!usuario || typeof senha !== 'string' || !senha) return false
  const nova = db.prepare('SELECT hash FROM senhas WHERE login = ?').get(usuario.login)
  return nova ? confereHash(senha, nova.hash) : igual(usuario.senha, senha)
}

// Confere usuário e senha no login. Devolve o usuário ou null.
// Só confere a senha de quem foi digitado; usuário inexistente gasta o mesmo tempo (hash falso).
export async function entrar (lista, login, senha) {
  const l = typeof login === 'string' ? login.trim().toLowerCase() : ''
  const u = lista.find(x => x.login === l)
  if (!u) { await confereHash(String(senha || 'x'), HASH_FALSO); return null }
  return (await senhaValida(u, senha)) ? u : null
}

export function problemaSenha (nova, confirma) {
  if (String(nova || '').length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
  if (nova !== confirma) return 'As duas senhas não são iguais.'
  return ''
}

export function trocarSenha (login, nova) {
  db.prepare('INSERT INTO senhas (login, hash, trocada_em) VALUES (?, ?, ?) ON CONFLICT(login) DO UPDATE SET hash = excluded.hash, trocada_em = excluded.trocada_em')
    .run(login, hashSenha(nova), Date.now())
}

// Volta a valer a senha do .env (usado pelo "cartadex zerar-senha").
export function zerarSenha (login) {
  const n = db.prepare('DELETE FROM senhas WHERE login = ?').run(login).changes
  db.prepare('DELETE FROM sessoes WHERE login = ?').run(login)
  return n > 0
}

// ---------- Sessões ----------
export function lerCookies (req) {
  const out = {}
  for (const parte of String(req.headers?.cookie || '').split(';')) {
    const i = parte.indexOf('=')
    if (i <= 0) continue
    const v = parte.slice(i + 1).trim()
    try { out[parte.slice(0, i).trim()] = decodeURIComponent(v) } catch { out[parte.slice(0, i).trim()] = v } // cookie estranho não derruba o painel
  }
  return out
}

const ehHttps = req => req.secure || String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'

function cookie (req, valor, maxAgeSeg) {
  const partes = [`${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (maxAgeSeg !== undefined) partes.push(`Max-Age=${maxAgeSeg}`)
  if (ehHttps(req)) partes.push('Secure')
  return partes.join('; ')
}

function marca (req, valor, maxAgeSeg) {
  const partes = [`${MARCA}=${valor}`, 'Path=/', 'SameSite=Lax']
  if (maxAgeSeg !== undefined) partes.push(`Max-Age=${maxAgeSeg}`)
  if (ehHttps(req)) partes.push('Secure')
  return partes.join('; ')
}

export function criarSessao (req, res, login, lembrar, agora = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url')
  const dur = lembrar ? DIAS_LEMBRAR * 86_400_000 : HORAS_SEM_LEMBRAR * 3_600_000
  db.prepare('INSERT INTO sessoes (token_hash, login, criada_em, expira_em, visto_em, ip, aparelho) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sha(token), login, agora, agora + dur, agora, null, String(req.headers?.['user-agent'] || '').slice(0, 160))
  const idade = lembrar ? DIAS_LEMBRAR * 86_400 : undefined
  res.setHeader('Set-Cookie', [cookie(req, token, idade), marca(req, '1', idade)])
  if (Math.random() < 0.1) db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agora)
  return token
}

// Login da sessão deste pedido (ou null). Sessão sem "lembrar" vai renovando enquanto a pessoa usa.
export function sessaoDe (req, agora = Date.now()) {
  const token = lerCookies(req)[COOKIE]
  if (!token) return null
  const s = db.prepare('SELECT * FROM sessoes WHERE token_hash = ?').get(sha(token))
  if (!s || s.expira_em < agora) return null
  if (!s.visto_em || agora - s.visto_em > 60_000) db.prepare('UPDATE sessoes SET visto_em = ? WHERE token_hash = ?').run(agora, s.token_hash)
  return { login: s.login, token, expira_em: s.expira_em }
}

// Sessões criadas antes da marca existir (ou marca apagada): devolve a marca junto com a página.
export function garantirMarca (req, res, s, agora = Date.now()) {
  if (lerCookies(req)[MARCA] === '1') return
  const resto = Math.max(60, Math.floor((s.expira_em - agora) / 1000))
  res.append ? res.append('Set-Cookie', marca(req, '1', resto)) : res.setHeader('Set-Cookie', marca(req, '1', resto))
}

export function sair (req, res) {
  const token = lerCookies(req)[COOKIE]
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sha(token))
  res.setHeader('Set-Cookie', [cookie(req, '', 0), marca(req, '', 0)])
}

// Depois de trocar a senha, os outros aparelhos saem.
export function derrubarOutras (login, tokenAtual = '') {
  return db.prepare('DELETE FROM sessoes WHERE login = ? AND token_hash <> ?').run(login, tokenAtual ? sha(tokenAtual) : '').changes
}

export const sessoesAtivas = (login, agora = Date.now()) => db.prepare('SELECT COUNT(*) n FROM sessoes WHERE login = ? AND expira_em > ?').get(login, agora).n

// ---------- WhatsApp de cada usuário ----------
export const limparTelefone = t => {
  let d = String(t || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = '55' + d // número brasileiro sem o 55
  return d
}
export function telefoneDe (login, env = process.env) {
  const salvo = db.prepare('SELECT telefone FROM usuarios_whats WHERE login = ?').get(login)?.telefone
  return limparTelefone(salvo || env[`WHATS_${String(login).toUpperCase()}`] || '')
}
export function salvarTelefone (login, tel) {
  const d = limparTelefone(tel)
  db.prepare('INSERT INTO usuarios_whats (login, telefone) VALUES (?, ?) ON CONFLICT(login) DO UPDATE SET telefone = excluded.telefone').run(login, d || null)
  return d
}
export const mascarar = tel => tel ? `(${tel.slice(2, 4)}) •••••-${tel.slice(-4)}` : ''

// Quem recebe o código de quem não tem WhatsApp cadastrado.
export function adminDosCodigos (lista) {
  const escolhido = cfg('codigo_admin')
  return lista.find(u => u.login === escolhido && telefoneDe(u.login)) || lista.find(u => telefoneDe(u.login)) || null
}

// ---------- Código de acesso ----------
export function podePedirCodigo (login, agora = Date.now()) {
  db.prepare('DELETE FROM pedidos_codigo WHERE ts < ?').run(agora - 3_600_000)
  return db.prepare('SELECT COUNT(*) n FROM pedidos_codigo WHERE login = ?').get(login).n < PEDIDOS_POR_HORA
}

export function gerarCodigo (login, agora = Date.now()) {
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  db.prepare(`INSERT INTO codigos_acesso (login, hash, criado_em, expira_em, tentativas) VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(login) DO UPDATE SET hash = excluded.hash, criado_em = excluded.criado_em, expira_em = excluded.expira_em, tentativas = 0`)
    .run(login, sha(login + ':' + codigo), agora, agora + MINUTOS_CODIGO * 60_000)
  db.prepare('INSERT INTO pedidos_codigo (login, ts) VALUES (?, ?)').run(login, agora)
  return codigo
}

// 'ok' | 'errado' | 'expirado' (vencido, já usado ou tentativas demais)
export function conferirCodigo (login, codigo, agora = Date.now()) {
  const c = db.prepare('SELECT * FROM codigos_acesso WHERE login = ?').get(login)
  if (!c || c.expira_em < agora || c.tentativas >= TENTATIVAS_CODIGO) return 'expirado'
  const limpo = String(codigo || '').replace(/\D/g, '')
  if (limpo.length === 6 && igual(c.hash, sha(login + ':' + limpo))) {
    db.prepare('DELETE FROM codigos_acesso WHERE login = ?').run(login)
    return 'ok'
  }
  db.prepare('UPDATE codigos_acesso SET tentativas = tentativas + 1 WHERE login = ?').run(login)
  return c.tentativas + 1 >= TENTATIVAS_CODIGO ? 'expirado' : 'errado'
}

export function textoCodigo (codigo, usuario, paraAdmin) {
  return paraAdmin
    ? `🔐 *CartaDex*: ${usuario.nome} pediu um código para trocar a senha do painel.\n\nCódigo: *${codigo}*\n\nVale ${MINUTOS_CODIGO} minutos. Só passe para ${usuario.nome} se tiver certeza de que foi ele(a) que pediu.`
    : `🔐 *CartaDex*: seu código de acesso é *${codigo}*\n\nVale ${MINUTOS_CODIGO} minutos. Não passe para ninguém. Se não foi você que pediu, ignore esta mensagem.`
}
