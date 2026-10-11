// Banco de dados SQLite (usa o módulo node:sqlite, que já vem no Node 22.13+).
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

export const PASTA_DADOS = process.env.PASTA_DADOS || path.resolve('dados')
export const PASTA_FOTOS = path.join(PASTA_DADOS, 'fotos')
fs.mkdirSync(PASTA_FOTOS, { recursive: true })

export const db = new DatabaseSync(process.env.ARQUIVO_BANCO || path.join(PASTA_DADOS, 'pokebot.db'))

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lotes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  criado_em  INTEGER NOT NULL
);

-- Status da carta:
--  pendente  = cadastrada, ainda não enviada
--  agendada  = vai entrar na fila em "enviar_em"
--  fila      = aguardando a vez de ser postada
--  no_ar     = foto e enquete postadas, recebendo lances
--  vendida   = encerrada com vencedor
--  sem_lance = encerrada sem nenhum voto (pode ser reenviada)
CREATE TABLE IF NOT EXISTS cartas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id        INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  foto           TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  v1             INTEGER,            -- valores em centavos
  v2             INTEGER,
  v3             INTEGER,
  arremate       INTEGER,
  status         TEXT NOT NULL DEFAULT 'pendente',
  enviar_em      INTEGER,            -- datas em milissegundos (epoch)
  encerra_em     INTEGER,
  na_fila_em     INTEGER,
  enviada_em     INTEGER,
  encerrada_em   INTEGER,
  envios         INTEGER NOT NULL DEFAULT 0,
  foto_msg_id    TEXT,
  enquete_msg_id TEXT,
  opcoes         TEXT,               -- JSON com os textos das opções da enquete enviada
  vencedor       TEXT,               -- jid de quem ganhou
  valor_venda    INTEGER,
  opcao_venda    INTEGER,            -- 0,1,2 = valores; 3 = arremate
  erro           TEXT,               -- último erro de envio, se houver
  remessa_id     INTEGER REFERENCES remessas(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cartas_status ON cartas(status);
CREATE INDEX IF NOT EXISTS idx_cartas_enquete ON cartas(enquete_msg_id);

-- Um voto por pessoa por carta (enquete de escolha única).
CREATE TABLE IF NOT EXISTS votos (
  carta_id INTEGER NOT NULL REFERENCES cartas(id) ON DELETE CASCADE,
  votante  TEXT NOT NULL,
  opcao    INTEGER NOT NULL,
  ts       INTEGER NOT NULL,          -- horário do voto (desempate: quem votou primeiro)
  PRIMARY KEY (carta_id, votante)
);

-- Mensagens de enquete enviadas (o WhatsApp precisa delas para decifrar os votos).
-- Chave de cada enquete enviada (necessária para decifrar os votos).
CREATE TABLE IF NOT EXISTS segredos (
  id      TEXT PRIMARY KEY,
  segredo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mensagens (
  id   TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

-- Nomes e telefones vistos no grupo, para mostrar quem ganhou.
CREATE TABLE IF NOT EXISTS contatos (
  jid      TEXT PRIMARY KEY,
  nome     TEXT,
  telefone TEXT
);

-- Remessas para compradores (envio físico das cartas vendidas).
CREATE TABLE IF NOT EXISTS remessas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  comprador  TEXT NOT NULL,           -- jid
  nome       TEXT,
  telefone   TEXT,
  endereco   TEXT,
  rastreio   TEXT,
  status     TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  obs        TEXT,
  criada_em  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`)

// Grupos onde o bot posta. pausado = 1: não recebe envios novos.
db.exec(`CREATE TABLE IF NOT EXISTS grupos (
  jid           TEXT PRIMARY KEY,
  nome          TEXT,
  pausado       INTEGER NOT NULL DEFAULT 0,
  adicionado_em INTEGER NOT NULL
);
-- Cada carta pode ser postada em vários grupos: uma linha por grupo.
CREATE TABLE IF NOT EXISTS postagens (
  carta_id       INTEGER NOT NULL REFERENCES cartas(id) ON DELETE CASCADE,
  grupo_jid      TEXT NOT NULL,
  foto_msg_id    TEXT,
  enquete_msg_id TEXT,
  enviada_em     INTEGER NOT NULL,
  PRIMARY KEY (carta_id, grupo_jid)
);
CREATE INDEX IF NOT EXISTS idx_postagens_enquete ON postagens(enquete_msg_id);`)

// Divulgação: mensagens (texto e foto opcional) enviadas aos grupos agora, agendadas ou repetindo.
db.exec(`CREATE TABLE IF NOT EXISTS divulgacoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  texto        TEXT NOT NULL DEFAULT '',
  foto         TEXT,                          -- arquivo na pasta de fotos (opcional)
  destino      TEXT,                          -- JSON com os grupos; vazio = todos os ativos
  proximo_em   INTEGER,                       -- quando sai a próxima vez
  repetir      TEXT NOT NULL DEFAULT '',      -- '', 'diario' ou 'semanal'
  status       TEXT NOT NULL DEFAULT 'agendada', -- agendada, enviando, enviada, erro
  envios       INTEGER NOT NULL DEFAULT 0,
  ultimo_envio INTEGER,
  erro         TEXT,
  criada_por   TEXT,
  criada_em    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_divulgacoes_proximo ON divulgacoes(status, proximo_em);`)

// Quem fez o quê no painel (entradas, ações e senhas erradas).
db.exec(`CREATE TABLE IF NOT EXISTS atividade (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  usuario  TEXT,
  tipo     TEXT NOT NULL,     -- entrada, acao, falha, bloqueio
  texto    TEXT NOT NULL,
  ip       TEXT
);
CREATE INDEX IF NOT EXISTS idx_atividade_ts ON atividade(ts);`)

export function registrarAtividade (usuario, tipo, texto, ip = '', ts = Date.now()) {
  db.prepare('INSERT INTO atividade (ts, usuario, tipo, texto, ip) VALUES (?, ?, ?, ?, ?)').run(ts, usuario || null, tipo, String(texto).slice(0, 300), ip || null)
  // Guarda só os últimos 90 dias.
  if (Math.random() < 0.02) db.prepare('DELETE FROM atividade WHERE ts < ?').run(ts - 90 * 86400_000)
}

// Colunas adicionadas depois da primeira versão (bancos antigos ganham elas aqui).
function garantirColuna (tabela, coluna, tipo) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some(c => c.name === coluna)
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`)
}
garantirColuna('cartas', 'grupo_jid', 'TEXT')       // grupo onde a carta foi postada
garantirColuna('cartas', 'previa_em', 'INTEGER')    // quando saiu a prévia (sem enquete)
garantirColuna('cartas', 'numero', 'INTEGER')       // número da carta dentro do lote (#1, #2, ...)
garantirColuna('cartas', 'destino', 'TEXT')         // JSON com os grupos escolhidos no envio (vazio = todos os ativos)
garantirColuna('cartas', 'remessa_apagada', 'INTEGER') // número da remessa apagada (a carta já foi enviada; não volta para Vendas)
garantirColuna('cartas', 'fora_relatorio', 'INTEGER')  // quando foi excluída dos relatórios (continua existindo para vendas/remessas)
garantirColuna('votos', 'alterado', 'INTEGER')
garantirColuna('lotes', 'oculto', 'INTEGER')          // lote excluído que tinha vendas: some da lista, as vendas continuam        // último horário em que a pessoa mexeu no voto (ignora mensagens atrasadas)

// Cartas antigas ganham número pela ordem em que foram cadastradas em cada lote.
db.exec(`UPDATE cartas SET numero = (SELECT COUNT(*) FROM cartas c2 WHERE c2.lote_id = cartas.lote_id AND c2.id <= cartas.id)
  WHERE numero IS NULL`)
// Cada carta nova recebe o próximo número do seu lote (lote novo começa no #1).
db.exec(`CREATE TRIGGER IF NOT EXISTS numerar_carta AFTER INSERT ON cartas WHEN NEW.numero IS NULL
BEGIN
  UPDATE cartas SET numero = (SELECT COALESCE(MAX(numero), 0) + 1 FROM cartas WHERE lote_id = NEW.lote_id AND id <> NEW.id)
  WHERE id = NEW.id;
END`)

const PADROES = {
  grupo_jid: '',
  grupo_nome: '',
  intervalo_min: '8',        // segundos entre uma carta e outra
  intervalo_max: '15',
  link_ativo: '0',
  link_url: '',
  link_texto: '🛒 Confira todas as cartas da loja: {link}',
  link_hora_inicio: '8',     // envia o link só entre estes horários
  link_hora_fim: '22',
  link_ultimo: '',           // controle interno: última hora em que o link foi enviado
  anunciar_resultado: '1',
  ganhador_ativo: '0',       // aviso no privado para quem ganhou
  ganhador_link: '',         // link de pagamento ({valor} vira o total)
  ganhador_msg: '',          // vazio = mensagem padrão
  ganhador_fotos: 'mural',   // mural (todas numa imagem) | separadas
  mp_token: '',              // Access Token do Mercado Pago (link por ganhador + confirmação automática)
  cobranca_ativo: '1',       // lembrete para quem não pagou
  cobranca_horas: '10:00,19:00',
  cobranca_msg: '',          // vazio = lembrete padrão
  cobranca_avisar_pago: '1', // mensagem de "pagamento recebido"
  cobranca_msg_pago: '',
  rastreio_ativo: '1',       // manda o código de rastreio ao comprador
  rastreio_chave: '',        // chave do PacoteVício (RapidAPI) para ler as atualizações
  rastreio_horas: '6',       // de quantas em quantas horas confere cada remessa
  rastreio_avisar: 'marcos', // marcos | tudo | nada
  rastreio_limite: '950',    // consultas por mês (o plano grátis tem 1.000)
  rastreio_link: 'https://www.linkcorreios.com.br/?id={codigo}',
  rastreio_msg: '',
  rastreio_msg_mov: '',
  fila_pausada: '0',
  apagar_enquete: '1',       // ao encerrar, apaga a enquete do grupo
  apagar_foto: '0',          // ao encerrar, apaga também a foto
  previa_texto: '👀 *Prévia do próximo leilão!*\n{n} cartas entram em disputa {quando}. Separe seus lances! 🔥',
  horario_ativo: '0',        // fechar e abrir os grupos sozinho todo dia
  horario_fechar: '23:00',   // a partir daqui só administradores mandam mensagem
  horario_abrir: '08:00',    // e daqui em diante todo mundo volta a mandar
  horario_msg_fechar: '🔒 Grupo fechado por hoje. Voltamos às {abre}!',
  horario_msg_abrir: '🔓 Grupo aberto! Bom dia, pessoal.',
  horario_marca: '',         // controle interno: último fechar/abrir automático aplicado
  strikes_ativo: '1',        // tirar o lance depois do prazo dá strike
  strikes_minutos: '2',      // prazo para tirar o lance sem strike
  strikes_limite: '3',       // com tantos strikes, a pessoa é bloqueada
  links_ativo: '0',          // gerenciador de links: apaga links de quem não pode mandar
  links_dominios: '',        // sites que qualquer um pode mandar (ex.: o da loja)
  links_aviso: '⚠️ @{nome}, aqui só administradores e números autorizados mandam link. Sua mensagem foi apagada.',
  backup_ativo: '1',         // backup automático todo dia
  backup_hora: '3',          // a partir desta hora (madrugada, sem atrapalhar o leilão)
  backup_remoto: 'gdrive:CartaDex', // pasta no Google Drive (nome do remoto no rclone + pasta)
  backup_dias: '30',         // apaga do Drive as cópias do banco mais velhas que isso
  backup_fotos: '1',         // envia também as fotos das cartas
  backup_dia: '',            // controle interno: dia do último backup que deu certo
  backup_status: ''          // controle interno: resultado do último backup (JSON)
}

export function cfg (chave) {
  const linha = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)
  return linha ? linha.valor : (PADROES[chave] ?? '')
}

export function setCfg (chave, valor) {
  db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    .run(chave, String(valor ?? ''))
}

export function todasCfg () {
  const r = { ...PADROES }
  for (const l of db.prepare('SELECT chave, valor FROM config').all()) r[l.chave] = l.valor
  return r
}

// Executa várias operações como uma só (tudo ou nada).
export function transacao (fn) {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function nomeContato (jid) {
  if (!jid) return ''
  const c = db.prepare('SELECT nome, telefone FROM contatos WHERE jid = ?').get(jid)
  const numero = c?.telefone || (jid.endsWith('@s.whatsapp.net') ? '+' + jid.split('@')[0] : '')
  if (c?.nome && numero) return `${c.nome} (${numero})`
  return c?.nome || numero || jid.split('@')[0]
}

export function salvarContato (jid, nome, telefone) {
  if (!jid) return
  db.prepare(`INSERT INTO contatos (jid, nome, telefone) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET
      nome = COALESCE(excluded.nome, contatos.nome),
      telefone = COALESCE(excluded.telefone, contatos.telefone)`)
    .run(jid, nome || null, telefone || null)
}

// Versões antigas tinham um grupo só (config grupo_jid). Passa ele e as postagens antigas para as tabelas novas.
if (cfg('grupos_migrados') !== '1') {
  transacao(() => {
    const antigo = cfg('grupo_jid')
    if (antigo) {
      db.prepare('INSERT OR IGNORE INTO grupos (jid, nome, pausado, adicionado_em) VALUES (?, ?, 0, ?)').run(antigo, cfg('grupo_nome') || null, Date.now())
    }
    db.prepare(`INSERT OR IGNORE INTO postagens (carta_id, grupo_jid, foto_msg_id, enquete_msg_id, enviada_em)
      SELECT id, COALESCE(grupo_jid, ?), foto_msg_id, enquete_msg_id, COALESCE(enviada_em, 0) FROM cartas
      WHERE enquete_msg_id IS NOT NULL AND COALESCE(grupo_jid, ?) <> ''`).run(antigo, antigo)
    setCfg('grupos_migrados', '1')
  })
}
