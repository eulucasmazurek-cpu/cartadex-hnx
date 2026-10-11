// Conexão com o WhatsApp (biblioteca Baileys, conecta pelo QR code).
import * as B from '@whiskeysockets/baileys'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import pino from 'pino'
import qrTerminal from 'qrcode-terminal'
import { db, salvarContato, PASTA_DADOS, PASTA_FOTOS } from './db.js'
import { nomeGrupo, grupoDoBot } from './grupos.js'
import { textoSuspeito, registrarSpam, registrarEntrada, removerMembro } from './seguranca.js'
import { registrarAtividade, cfg } from './db.js'
import { decidirLink, registrarApagado, estaAutorizado, linksDoTexto, dominiosLiberados } from './links.js'
import { processarVotos, processarVotoBruto, normalizarJid } from './votos.js'
import { opcoesDaCarta, tituloEnquete, numCarta, nomeLote } from './leilao.js'

// Compatível com as versões 6 e 7 da biblioteca.
const lib = B.makeWASocket ? B : (B.default?.makeWASocket ? B.default : B)
const makeWASocket = lib.makeWASocket || (typeof lib.default === 'function' ? lib.default : lib.default?.default)
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, BufferJSON, proto } = lib

const PASTA_LOGIN = path.join(PASTA_DADOS, 'login-whatsapp')
const logger = pino({ level: process.env.LOG_BAILEYS || 'silent' })

export const estado = { sock: null, conectado: false, qr: null, eu: '', ultimoErro: '', enviando: null }

const esperar = ms => new Promise(r => setTimeout(r, ms))

// Evita que um envio travado prenda a fila para sempre.
function comPrazo (promessa, ms, oque) {
  let t
  return Promise.race([
    promessa,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`Tempo esgotado ao ${oque} (${ms / 1000}s)`)), ms) })
  ]).finally(() => clearTimeout(t))
}

function salvarMensagem (msg) {
  if (!msg?.key?.id || !msg.message) return
  db.prepare('INSERT OR REPLACE INTO mensagens (id, json) VALUES (?, ?)')
    .run(msg.key.id, JSON.stringify(msg.message, BufferJSON.replacer))
}

// Id no mesmo formato que a biblioteca usa (quando ela tem a função própria, usa a dela).
function novoIdMensagem () {
  try {
    if (typeof lib.generateMessageIDV2 === 'function') return lib.generateMessageIDV2(estado.sock?.user?.id)
    if (typeof lib.generateMessageID === 'function') return lib.generateMessageID()
  } catch {}
  return '3EB0' + randomBytes(9).toString('hex').toUpperCase()
}

function salvarSegredo (id, segredo) {
  if (!id || !segredo) return
  const b64 = typeof segredo === 'string' ? segredo : Buffer.from(segredo).toString('base64')
  db.prepare('INSERT OR REPLACE INTO segredos (id, segredo) VALUES (?, ?)').run(id, b64)
}

function segredoDa (id) {
  const l = db.prepare('SELECT segredo FROM segredos WHERE id = ?').get(id)
  if (l) return Buffer.from(l.segredo, 'base64')
  try {
    const s = carregarMensagem(id)?.messageContextInfo?.messageSecret
    return s?.length ? Buffer.from(s) : null
  } catch { return null }
}

function rotuloCarta (id) {
  const c = db.prepare('SELECT id, numero, lote_id FROM cartas WHERE id = ?').get(id)
  return c ? `${nomeLote(c.lote_id)} #${numCarta(c)}` : `carta ${id}`
}

function meusJids () {
  const u = estado.sock?.user || {}
  return [u.id, u.lid, estado.eu].filter(Boolean)
}

function carregarMensagem (id) {
  const l = db.prepare('SELECT json FROM mensagens WHERE id = ?').get(id)
  if (!l) return undefined
  return proto.Message.fromObject(JSON.parse(l.json, BufferJSON.reviver))
}

function telefoneDe (...jids) {
  for (const j of jids) {
    if (j && j.endsWith('@s.whatsapp.net')) return '+' + normalizarJid(j).split('@')[0]
  }
  return null
}

// Se a reconexão falhar (sem internet, por exemplo), tenta de novo com espera crescente (até 5 minutos).
let tentativasReconexao = 0
function reconectar () {
  conectar().then(() => { tentativasReconexao = 0 }).catch(async e => {
    tentativasReconexao++
    const espera = Math.min(300_000, 5000 * 2 ** Math.min(tentativasReconexao, 6))
    console.error(`Erro ao reconectar (tento de novo em ${Math.round(espera / 1000)}s):`, e.message || e)
    await esperar(espera)
    reconectar()
  })
}

export async function conectar () {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_LOGIN)
  let version
  try { ({ version } = await fetchLatestBaileysVersion()) } catch {}

  const sock = makeWASocket({
    auth: state,
    logger,
    ...(version ? { version } : {}),
    browser: ['CartaDex', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Necessário para decifrar os votos das enquetes:
    getMessage: async key => carregarMensagem(key.id)
  })
  estado.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      estado.qr = qr
      console.log('\n📱 Escaneie o QR code abaixo no WhatsApp do número do bot')
      console.log('   (WhatsApp > Aparelhos conectados > Conectar um aparelho), ou abra o painel em /conexao\n')
      qrTerminal.generate(qr, { small: true })
    }
    if (connection === 'open') {
      estado.conectado = true
      estado.qr = null
      estado.eu = normalizarJid(sock.user?.id || '')
      console.log(`✅ WhatsApp conectado como ${estado.eu}`)
    }
    if (connection === 'close') {
      estado.conectado = false
      const codigo = lastDisconnect?.error?.output?.statusCode
      estado.ultimoErro = lastDisconnect?.error?.message || ''
      if (codigo === DisconnectReason.loggedOut) {
        console.log('⚠️  O número foi desconectado do WhatsApp. Apagando login e gerando novo QR code...')
        fs.rmSync(PASTA_LOGIN, { recursive: true, force: true })
      } else {
        console.log(`🔌 Conexão caiu (${codigo || 'sem código'}). Reconectando em 5 segundos...`)
      }
      await esperar(5000)
      reconectar()
    }
  })

  // Guarda nomes e telefones de quem fala no grupo (para mostrar quem ganhou)
  // e decifra os votos das enquetes por conta própria.
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const m of messages) {
      const k = m.key || {}
      if (m.message?.pollUpdateMessage) {
        try {
          const r = processarVotoBruto(m, { segredoDa, meusJids: meusJids(), meuJid: estado.eu })
          const rot = r.cartaId ? rotuloCarta(r.cartaId) : ''
          if (r.ok) console.log(`🗳️  Voto registrado em ${rot}${r.opcoes ? '' : ' (voto retirado)'}`)
          else if (r.cartaId) console.log(`⚠️  Voto em ${rot} não foi lido: ${r.motivo}`)
        } catch (e) {
          console.error('Erro ao ler voto:', e.message)
        }
      }
      if (!k.remoteJid?.endsWith('@g.us') || k.fromMe) continue
      const jid = normalizarJid(k.participant)
      if (!jid) continue
      salvarContato(jid, m.pushName, telefoneDe(k.participant, k.participantPn, k.participantAlt, k.senderPn))
      // Link ou propaganda num grupo do leilão vira sinal de spam (só mensagens novas).
      if (type === 'notify' && grupoDoBot(k.remoteJid)) {
        const msg = m.message || {}
        const texto = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || ''
        const fone = telefoneDe(k.participant, k.participantPn, k.participantAlt, k.senderPn)
        cuidarDoLink(m, jid, fone, texto).catch(e => console.error('Erro no gerenciador de links:', e.message))
        const liberado = h => dominiosLiberados().some(d => h === d || h.endsWith('.' + d))
        const hosts = linksDoTexto(texto)
        const motivo = estaAutorizado(jid, fone) || (hosts.length && hosts.every(liberado) && textoSuspeito(texto) === 'link') ? '' : textoSuspeito(texto)
        if (motivo) {
          registrarSpam(jid, k.remoteJid, texto)
          console.log(`🚩 Mensagem suspeita de ${m.pushName || jid} em ${nomeGrupo(k.remoteJid)}: ${motivo}`)
        }
      }
    }
  })

  // Quem entra e sai dos grupos do leilão (para a verificação de membros).
  sock.ev.on('group-participants.update', ({ id, participants, action }) => {
    if (action === 'promote' || action === 'demote') adminsCache.delete(id)
    if (!grupoDoBot(id)) return
    for (const p of participants || []) {
      try {
        const m = participanteParaMembro(p)
        if (!m.jid) continue
        if (action === 'remove') { removerMembro(id, m.jid); continue }
        if (action !== 'add') continue
        const r = registrarEntrada(id, m)
        if (r.nivel === 'alto') {
          const quem = r.nome || (r.telefone ? '+' + r.telefone : 'número escondido')
          console.log(`🚨 Membro de alto risco entrou em ${nomeGrupo(id)}: ${quem} (${r.motivos.join('; ')})`)
          registrarAtividade('CartaDex', 'acao', `Membro de alto risco entrou em ${nomeGrupo(id)}: ${quem} (${r.motivos.join('; ')})`.slice(0, 290))
        }
      } catch (e) { console.error('Erro ao registrar entrada no grupo:', e.message) }
    }
  })

  // Votos nas enquetes chegam aqui.
  sock.ev.on('messages.update', eventos => {
    for (const { key, update } of eventos) {
      if (!update?.pollUpdates?.length) continue
      try {
        // Caminho da própria biblioteca (quando ela consegue decifrar). Votos repetidos não contam duas vezes.
        processarVotos(key.id, update.pollUpdates, estado.eu)
      } catch (e) {
        console.error('Erro ao registrar voto:', e)
      }
    }
  })

  return sock
}

function exigirConexao (grupo) {
  if (!estado.conectado || !estado.sock) throw new Error('WhatsApp desconectado')
  if (!grupo) throw new Error('Nenhum grupo escolhido (painel > Conexão)')
  return grupo
}

// Posta a foto (sem legenda) e, logo abaixo, a enquete respondendo à foto, com lote, número e descrição no título.
export async function postarCarta (carta, grupo) {
  exigirConexao(grupo)
  const caminho = path.join(PASTA_FOTOS, carta.foto)
  if (!fs.existsSync(caminho)) throw new Error('Foto não encontrada no servidor')

  const opcoes = opcoesDaCarta(carta)
  console.log(`📤 Enviando ${nomeLote(carta.lote_id)} #${numCarta(carta)} para ${nomeGrupo(grupo)}...`)
  estado.enviando = carta.id
  try {
    const foto = await comPrazo(estado.sock.sendMessage(grupo, {
      image: { url: caminho }
    }), 90_000, 'enviar a foto')
    await esperar(300) // a enquete sai logo em seguida, respondendo à foto
    const segredo = randomBytes(32)
    // O id da enquete é escolhido antes de enviar e a chave já fica guardada: se o envio demorar
    // a confirmar (mas sair), os votos dela continuam sendo lidos e a carta não é postada de novo.
    const idEnquete = novoIdMensagem()
    salvarSegredo(idEnquete, segredo)
    let enquete
    try {
      enquete = await comPrazo(estado.sock.sendMessage(grupo, {
        poll: { name: tituloEnquete(carta), values: opcoes.map(o => o.texto), selectableCount: 1, messageSecret: segredo }
      }, { quoted: foto, messageId: idEnquete }), 60_000, 'enviar a enquete')
    } catch (e) {
      if (/Tempo esgotado/.test(e.message)) {
        e.incerto = true
        e.fotoId = foto?.key?.id
        e.enqueteId = idEnquete
      }
      throw e
    }
    salvarMensagem(enquete)
    const usado = enquete?.message?.messageContextInfo?.messageSecret
    salvarSegredo(enquete?.key?.id, usado?.length ? usado : segredo)
    console.log(`✅ ${nomeLote(carta.lote_id)} #${numCarta(carta)} no ar em ${nomeGrupo(grupo)}`)
    return { fotoId: foto?.key?.id, enqueteId: enquete?.key?.id, opcoes, grupo }
  } finally {
    estado.enviando = null
  }
}

// Foto sem enquete, para a prévia do leilão.
export async function postarPrevia (carta, legenda, grupo) {
  exigirConexao(grupo)
  const caminho = path.join(PASTA_FOTOS, carta.foto)
  if (!fs.existsSync(caminho)) throw new Error('Foto não encontrada no servidor')
  const m = await comPrazo(estado.sock.sendMessage(grupo, { image: { url: caminho }, caption: legenda }), 90_000, 'enviar a foto da prévia')
  return m?.key?.id
}

// Apaga para todos uma mensagem que o próprio bot enviou.
export async function apagarMensagem (grupo, id) {
  if (!estado.conectado || !estado.sock) throw new Error('WhatsApp desconectado')
  if (!grupo || !id) return
  await comPrazo(estado.sock.sendMessage(grupo, { delete: { remoteJid: grupo, fromMe: true, id } }), 30_000, 'apagar a mensagem')
}

export async function enviarTexto (texto, mencoes = [], grupo) {
  exigirConexao(grupo)
  return comPrazo(estado.sock.sendMessage(grupo, { text: texto, mentions: mencoes, linkPreview: null }), 60_000, 'enviar a mensagem')
}

// O número do bot sai do grupo no WhatsApp.
export async function sairDoGrupo (jid) {
  if (!estado.conectado || !estado.sock) throw new Error('WhatsApp desconectado')
  await comPrazo(estado.sock.groupLeave(jid), 30_000, 'sair do grupo')
}

// Lista os grupos do número do bot, dizendo se o grupo está fechado (só administradores
// mandam mensagem) e se o bot é administrador (necessário para fechar e abrir).
export async function listarGrupos () {
  if (!estado.conectado) return []
  const grupos = await estado.sock.groupFetchAllParticipating()
  const eu = new Set(meusJids().map(normalizarJid).filter(Boolean))
  const ehEu = p => [p.id, p.lid, p.jid, p.phoneNumber].some(j => j && eu.has(normalizarJid(j)))
  return Object.values(grupos)
    .map(g => ({
      id: g.id,
      nome: g.subject,
      membros: g.participants?.length || 0,
      fechado: Boolean(g.announce),
      souAdmin: (g.participants || []).some(p => ehEu(p) && (p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin || p.isSuperAdmin))
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

// ---------- Gerenciador de links ----------
const adminsCache = new Map() // grupo -> { ts, ids }
async function adminsDo (grupo) {
  const c = adminsCache.get(grupo)
  if (c && Date.now() - c.ts < 10 * 60_000) return c.ids
  const md = await comPrazo(estado.sock.groupMetadata(grupo), 20_000, 'ler os administradores')
  const ids = new Set()
  for (const p of md.participants || []) {
    if (!(p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin || p.isSuperAdmin)) continue
    for (const j of [p.id, p.lid, p.jid, p.phoneNumber]) if (j) ids.add(normalizarJid(j))
  }
  adminsCache.set(grupo, { ts: Date.now(), ids })
  return ids
}

async function cuidarDoLink (m, jid, fone, texto) {
  if (cfg('links_ativo') !== '1' || !texto) return
  const k = m.key
  const grupo = k.remoteJid
  let admin = false
  try {
    const ids = await adminsDo(grupo)
    admin = [k.participant, k.participantPn, k.participantAlt, k.senderPn].some(j => j && ids.has(normalizarJid(j)))
  } catch { admin = false }
  const d = decidirLink({ texto, jid, telefone: fone ? fone.replace(/\D/g, '') : '', admin })
  if (!d.apagar) return
  try {
    await comPrazo(estado.sock.sendMessage(grupo, { delete: { remoteJid: grupo, fromMe: false, id: k.id, participant: k.participant } }), 20_000, 'apagar o link')
    registrarApagado(jid, grupo, texto, true)
    console.log(`🔗 Link apagado de ${m.pushName || jid} em ${nomeGrupo(grupo)} (${d.motivo})`)
    const aviso = String(cfg('links_aviso') || '').trim()
    if (aviso) {
      const nome = String(k.participant || jid).split('@')[0]
      await comPrazo(estado.sock.sendMessage(grupo, { text: aviso.replaceAll('{nome}', nome), mentions: [k.participant || jid], linkPreview: null }), 20_000, 'avisar sobre o link')
    }
  } catch (e) {
    registrarApagado(jid, grupo, texto, false, /not-authorized|forbidden|403/i.test(e.message) ? 'o bot precisa ser administrador do grupo' : e.message)
  }
}

// Participante do WhatsApp (texto ou objeto, conforme a versão) -> membro para a verificação.
function participanteParaMembro (p) {
  const o = typeof p === 'string' ? { id: p } : (p || {})
  const id = o.id || o.jid || o.lid || o.phoneNumber
  const fone = [o.phoneNumber, o.jid, o.id].find(j => j && String(j).endsWith('@s.whatsapp.net'))
  return {
    jid: normalizarJid(id),
    id_wa: id,
    telefone: fone ? normalizarJid(fone).split('@')[0] : '',
    admin: o.admin === 'admin' || o.admin === 'superadmin' || Boolean(o.isAdmin || o.isSuperAdmin)
  }
}

// Todos os membros de um grupo.
export async function membrosDoGrupo (jid) {
  if (!estado.conectado || !estado.sock) throw new Error('WhatsApp desconectado')
  const md = await comPrazo(estado.sock.groupMetadata(jid), 30_000, 'ler os membros do grupo')
  return (md.participants || []).map(participanteParaMembro).filter(m => m.jid)
}

// Tira uma pessoa do grupo (o bot precisa ser administrador).
export async function removerDoGrupo (grupo, idWa) {
  if (!estado.conectado || !estado.sock) throw new Error('WhatsApp desconectado')
  try {
    await comPrazo(estado.sock.groupParticipantsUpdate(grupo, [idWa], 'remove'), 30_000, 'remover do grupo')
  } catch (e) {
    if (/not-authorized|forbidden|403|401/i.test(String(e.message) + String(e.output?.statusCode || ''))) throw new Error('o bot precisa ser administrador do grupo')
    throw e
  }
}

// fechar = true: só administradores mandam mensagem. false: todo mundo manda.
export async function fecharGrupo (jid, fechar) {
  if (!estado.conectado || !estado.sock) throw new Error('WhatsApp desconectado')
  try {
    await comPrazo(estado.sock.groupSettingUpdate(jid, fechar ? 'announcement' : 'not_announcement'), 30_000, fechar ? 'fechar o grupo' : 'abrir o grupo')
  } catch (e) {
    if (/not-authorized|forbidden|403|401/i.test(String(e.message) + String(e.output?.statusCode || ''))) {
      throw new Error('o bot precisa ser administrador do grupo')
    }
    throw e
  }
}

// Foto com legenda (usada na divulgação).
export async function enviarFoto (caminho, legenda, grupo) {
  exigirConexao(grupo)
  if (!fs.existsSync(caminho)) throw new Error('Foto não encontrada no servidor')
  return comPrazo(estado.sock.sendMessage(grupo, { image: { url: caminho }, caption: legenda || undefined }), 90_000, 'enviar a foto')
}
