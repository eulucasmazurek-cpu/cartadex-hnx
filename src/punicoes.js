// Strikes e bloqueios: quem tira o lance depois do prazo leva strike; com strikes demais, é bloqueado.
// Mudar de lance (trocar de opção) nunca dá strike. Bloqueado = votos não valem até desbloquear.
import { db, cfg, registrarAtividade, nomeContato } from './db.js'

db.exec(`CREATE TABLE IF NOT EXISTS strikes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  votante  TEXT NOT NULL,
  carta_id INTEGER,
  ts       INTEGER NOT NULL,
  motivo   TEXT
);
CREATE INDEX IF NOT EXISTS idx_strikes_votante ON strikes(votante);
CREATE TABLE IF NOT EXISTS bloqueados (
  votante TEXT PRIMARY KEY,
  desde   INTEGER NOT NULL,
  motivo  TEXT,
  por     TEXT
);`)

export const contarStrikes = votante => db.prepare('SELECT COUNT(*) n FROM strikes WHERE votante = ?').get(votante).n
export const estaBloqueado = votante => Boolean(db.prepare('SELECT 1 FROM bloqueados WHERE votante = ?').get(votante))

export function bloquear (votante, motivo, por = 'CartaDex', agora = Date.now()) {
  db.prepare('INSERT OR IGNORE INTO bloqueados (votante, desde, motivo, por) VALUES (?, ?, ?, ?)').run(votante, agora, motivo, por)
}

// Desbloquear também zera os strikes (senão o próximo strike bloquearia de novo).
export function desbloquear (votante) {
  db.prepare('DELETE FROM bloqueados WHERE votante = ?').run(votante)
  db.prepare('DELETE FROM strikes WHERE votante = ?').run(votante)
}

export const zerarStrikes = votante => db.prepare('DELETE FROM strikes WHERE votante = ?').run(votante)
export function tirarUmStrike (votante) {
  db.prepare('DELETE FROM strikes WHERE id = (SELECT MAX(id) FROM strikes WHERE votante = ?)').run(votante)
}

// Chamado quando alguém retira o voto. votoAtual = { opcao, ts } do lance que estava valendo.
// Devolve { strike, bloqueou, total } (ou null se não deu strike).
export function talvezStrike (cartaId, votante, votoAtual, tsRetirada) {
  if (cfg('strikes_ativo') !== '1' || !votoAtual) return null
  const prazo = (Number(cfg('strikes_minutos')) || 2) * 60_000
  const passou = tsRetirada - votoAtual.ts
  if (passou <= prazo) return null
  const min = Math.round(passou / 60_000)
  db.prepare('INSERT INTO strikes (votante, carta_id, ts, motivo) VALUES (?, ?, ?, ?)')
    .run(votante, cartaId, tsRetirada, `tirou o lance ${min} min depois de votar`)
  const total = contarStrikes(votante)
  const limite = Number(cfg('strikes_limite')) || 3
  const nome = nomeContato(votante)
  registrarAtividade('CartaDex', 'acao', `Strike ${total}/${limite} para ${nome}: tirou o lance ${min} min depois de votar`)
  console.log(`⚠️  Strike ${total}/${limite} para ${nome}`)
  let bloqueou = false
  if (total >= limite && !estaBloqueado(votante)) {
    bloquear(votante, `${total} strikes`)
    bloqueou = true
    registrarAtividade('CartaDex', 'acao', `${nome} foi bloqueado (${total} strikes): os votos dele não valem mais`)
    console.log(`🚫 ${nome} bloqueado (${total} strikes)`)
  }
  return { strike: true, bloqueou, total }
}

// Para a tela: quem está bloqueado e quem tem strikes.
export function listarPunicoes () {
  const bloqueados = db.prepare('SELECT * FROM bloqueados ORDER BY desde DESC').all()
  const comStrike = db.prepare(`SELECT s.votante, COUNT(*) n, MAX(s.ts) ultimo,
      (SELECT motivo FROM strikes x WHERE x.votante = s.votante ORDER BY x.id DESC LIMIT 1) motivo,
      (SELECT carta_id FROM strikes x WHERE x.votante = s.votante ORDER BY x.id DESC LIMIT 1) carta_id
    FROM strikes s WHERE s.votante NOT IN (SELECT votante FROM bloqueados) GROUP BY s.votante ORDER BY n DESC, ultimo DESC`).all()
  return { bloqueados, comStrike }
}
