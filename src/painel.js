// Painel web: cadastro de lotes, envios, encerramentos, reenvios e remessas.
import express from 'express'
import multer from 'multer'
import QRCode from 'qrcode'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { db, transacao, todasCfg, setCfg, cfg, nomeContato, registrarAtividade, PASTA_FOTOS } from './db.js'
import { listarGruposDoBot, gruposAtivos, adicionarGrupo, removerGrupo, pausarGrupo, renomearGrupo, grupoDoBot, lerDestino, descreverDestino } from './grupos.js'
import { criarDivulgacao, divulgacoesAgendadas, divulgacoesEnviadas, contarAgendadas, apagarDivulgacao, pegarDivulgacao } from './divulgacao.js'
import { fazerBackup, backupAntesDeApagar, backupRodando, statusBackup, listarBackupsLocais, MANTER_NO_SERVIDOR } from './backup.js'
import { situacaoRclone } from './rclone.js'
import { listarPunicoes, desbloquear, zerarStrikes, tirarUmStrike, bloquear } from './punicoes.js'
import { listarRiscos, verificarMembros, marcarConfiavel, tirarConfiavel, removerMembro } from './seguranca.js'
import { listarAutorizados, autorizar, desautorizar, ultimosApagados, apagadosHoje } from './links.js'
import { avisosDasCartas, avisarComprador, MENSAGEM_PADRAO } from './ganhador.js'
import { lembrarAgora, proximoLembrete, contarPendentes, cobrancasPendentes, pagasRecentes, cartasDaCobranca, cobrancaDaCarta, marcarPago, cancelarCobranca, verificarPagamentos, LEMBRETE_PADRAO, PAGO_PADRAO, SQL_A_RECEBER, cartaPaga, pagarPelaRemessa, avisoDoMP } from './cobranca.js'
import { temMP, contaMP } from './mercadopago.js'
import { TRANSPORTADORAS, MARCOS, transportadoraDe, codigoSalvo, mandarCodigo, conferir, usoDoMes, codigoLimpo, MSG_CODIGO, MSG_MOVIMENTO } from './rastreio.js'
import { lerUsuarios, criarLimitador, ipDe, descreverAcao } from './usuarios.js'
import * as S from './sessao.js'
import { lerValor, liderAtual, moeda, nomeLote } from './leilao.js'
import { enfileirar, cancelarEnvio, encerrarEAnunciar, enviarPrevia, textoPrevia, mudarGrupos, enviarDivulgacoes, enviarDivulgacaoAgora } from './fila.js'
import { gerarRelatorio, inicioDoPeriodo, PERIODOS } from './relatorios.js'
import * as P from './paginas.js'

const lista = v => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map(Number).filter(Number.isInteger)
const a = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

const contarVotos = id => db.prepare('SELECT COUNT(*) n FROM votos WHERE carta_id = ?').get(id).n
const votosDe = cartas => Object.fromEntries(cartas.filter(c => c.status === 'no_ar').map(c => [c.id, contarVotos(c.id)]))
const contagem = () => Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM cartas GROUP BY status').all().map(r => [r.status, r.n]))

function volta (res, url, { msg = '', erro = '' } = {}) {
  const q = new URLSearchParams()
  if (msg) q.set('msg', msg)
  if (erro) q.set('erro', erro)
  res.redirect(url + (q.size ? (url.includes('?') ? '&' : '?') + q : ''))
}

let WA = null // conexão do WhatsApp (definida em iniciarPainel)

// Números do menu lateral (contadores ao lado de cada item).
function infoMenu (req) {
  const cont = contagem()
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const agora = Date.now()
  let backup = null
  if (cfg('backup_ativo') === '1') {
    const b = statusBackup()
    backup = b && !b.ok ? { texto: 'falhou', ruim: true } : { texto: String(cfg('backup_hora') || '3').padStart(2, '0') + ':00', ruim: false }
  }
  return {
    pendente: cont.pendente || 0,
    no_ar: cont.no_ar || 0,
    sem_lance: cont.sem_lance || 0,
    semRemessa: db.prepare("SELECT COUNT(*) n FROM cartas WHERE status = 'vendida' AND remessa_id IS NULL AND remessa_apagada IS NULL").get().n,
    gruposAtivos: gruposAtivos().length,
    agendadas: contarAgendadas(),
    pagamentos: contarPendentes(),
    separar: db.prepare("SELECT COUNT(*) n FROM remessas WHERE status = 'pago'").get().n,
    links: cfg('links_ativo') === '1',
    bloqueados: listarPunicoes().bloqueados.length,
    risco: listarRiscos().alto.length,
    online: USUARIOS.filter(u => agora - ultimoAcesso(u.login) < 5 * 60_000).length,
    falhas: db.prepare("SELECT COUNT(*) n FROM atividade WHERE tipo IN ('falha','bloqueio') AND ts >= ?").get(hoje.getTime()).n,
    backup,
    conectado: Boolean(WA?.estado?.conectado),
    usuario: req.usuario?.nome || ''
  }
}

// Aceita o link mesmo colado junto com texto ("Pague aqui: https://..."), ou sem o https://.
// Devolve '' (vazio), o link limpo, ou null se não der para entender.
export function extrairLink (v) {
  const t = String(v || '').trim()
  if (!t) return ''
  const m = t.match(/https?:\/\/[^\s"'<>]+/i)
  if (m) return m[0].replace(/[).,;]+$/, '')
  const d = t.match(/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>]*)?$/i)
  return d ? 'https://' + d[0] : null
}
export function extrairToken (v) {
  return String(v || '').match(/(?:APP_USR|TEST)-[\w-]{20,}/)?.[0] || null
}

// "Versão" dos dados que aparecem nas listas (cartas, pagamentos, remessas, lotes). A tela guarda a versão
// com que foi montada; quando a do bot muda (um pagamento caiu, uma carta encerrou...), a tela se atualiza sozinha.
// Votos ficam de fora: eles já mudam na tela sem recarregar.
export function versaoDados () {
  try {
    const j = JSON.stringify([
      db.prepare('SELECT status, COUNT(*) n, MAX(id) m FROM cartas GROUP BY status ORDER BY status').all(),
      db.prepare('SELECT status, COUNT(*) n, MAX(id) m, MAX(pago_em) p, MAX(cancelada_em) c FROM cobrancas GROUP BY status ORDER BY status').all(),
      db.prepare('SELECT status, COUNT(*) n, MAX(id) m FROM remessas GROUP BY status ORDER BY status').all(),
      db.prepare('SELECT COUNT(*) n, MAX(id) m FROM lotes WHERE oculto IS NULL').get()
    ])
    return crypto.createHash('sha1').update(j).digest('hex').slice(0, 12)
  } catch { return '' }
}

function pagina (req, res, titulo, corpo, aba, extra = {}) {
  let menu = {}
  try { menu = infoMenu(req) } catch (e) { console.error('menu:', e.message) }
  res.send(P.layout(titulo, corpo, { aba, msg: req.query.msg, erro: req.query.erro, menu, dados: versaoDados(), ...extra }))
}

// Login: cada pessoa tem o seu usuário e senha (linhas SENHA_NOME no .env).
const USUARIOS = lerUsuarios()
const limitadorIp = criarLimitador()
// IPv6: a mesma pessoa troca de endereço dentro do mesmo bloco /64, então conta o bloco todo.
const chaveIp = ip => String(ip).includes(':') ? String(ip).split(':').slice(0, 4).join(':') + '::/64' : String(ip)
const limitador = {
  bloqueado: ip => limitadorIp.bloqueado(chaveIp(ip)),
  falhou: ip => limitadorIp.falhou(chaveIp(ip)),
  acertou: ip => limitadorIp.acertou(chaveIp(ip))
}
// Senhas erradas para o mesmo usuário (de qualquer endereço): 10 em 15 min trava esse usuário por 15 min.
const limitadorLogin = criarLimitador({ max: 10, janelaMs: 15 * 60_000, bloqueioMs: 15 * 60_000 })
const vistoEm = new Map() // "login|ip" -> último acesso, para registrar cada entrada uma vez

// Para onde voltar depois de entrar: só caminhos do próprio painel.
const voltaSegura = v => /^\/(?!\/)[^\s\\]*$/.test(String(v || '')) && !String(v).startsWith('/entrar') ? String(v) : '/'

function exigirLogin (req, res, next) {
  const ip = ipDe(req)
  const s = S.sessaoDe(req)
  const usuario = s && USUARIOS.find(u => u.login === s.login)
  if (usuario) {
    // Formulários só valem quando enviados pelo próprio painel (proteção contra sites de fora).
    if (req.method === 'POST') {
      const origem = req.headers.origin
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
      const mesmoSite = req.headers['sec-fetch-site'] === 'same-origin'
      let fora = false
      try { fora = Boolean(origem) && (origem === 'null' || new URL(origem).host !== host) } catch { fora = true }
      if (fora && !mesmoSite) return res.status(403).type('text').send('Pedido recusado (veio de fora do painel).')
    }
    req.usuario = usuario
    req.sessao = s
    S.garantirMarca(req, res, s)
    const chave = usuario.login + '|' + ip
    const antes = vistoEm.get(chave) || 0
    if (Date.now() - antes > 30 * 60_000) registrarAtividade(usuario.nome, 'entrada', 'Entrou no painel', ip)
    vistoEm.set(chave, Date.now())
    return next()
  }
  if (req.path.startsWith('/api/') || req.method !== 'GET') return res.status(401).type('text').send('Sessão encerrada. Entre de novo.')
  res.redirect('/entrar' + (req.originalUrl && req.originalUrl !== '/' ? '?volta=' + encodeURIComponent(req.originalUrl) : ''))
}

// Último acesso de cada usuário (pelo próprio painel, mais preciso que o registro de atividade).
function ultimoAcesso (login) {
  let m = 0
  for (const [k, ts] of vistoEm) if (k.startsWith(login + '|') && ts > m) m = ts
  return m
}

// Registra quem fez cada ação (todo POST que deu certo).
function registrarAcoes (req, res, next) {
  if (req.method !== 'POST' || !req.usuario) return next()
  const { texto, loteId } = descreverAcao(req.path)
  const lote = loteId ? db.prepare('SELECT nome FROM lotes WHERE id = ?').get(loteId)?.nome : ''
  res.on('finish', () => {
    if (res.statusCode >= 400) return
    let extra = ''
    try {
      const q = new URL(String(res.getHeader('Location') || ''), 'http://x').searchParams
      extra = q.get('erro') || q.get('msg') || ''
    } catch {}
    registrarAtividade(req.usuario.nome, 'acao', `${texto}${lote ? ` "${lote}"` : ''}${extra ? ` — ${extra}` : ''}`, ipDe(req))
  })
  next()
}

// Salva descrição e valores das cartas editáveis.
function salvarEdicoes (c = {}) {
  const st = db.prepare(`UPDATE cartas SET descricao = ?, v1 = ?, v2 = ?, v3 = ?, arremate = ?
    WHERE id = ? AND status IN ('pendente','agendada','sem_lance')`)
  let n = 0
  transacao(() => {
    // Os campos chegam como c[k12][v1] (o "k" evita que o Express trate o id como posição de lista).
    for (const [chave, f] of Object.entries(c)) {
      const id = Number(String(chave).replace(/^k/, ''))
      if (!Number.isInteger(id) || !f || typeof f !== 'object') continue
      n += Number(st.run(String(f.descricao ?? '').trim(), lerValor(f.v1), lerValor(f.v2), lerValor(f.v3), lerValor(f.arremate), id).changes)
    }
  })
  return n
}

const numeroDe = id => db.prepare('SELECT numero FROM cartas WHERE id = ?').get(id)?.numero ?? id

function resumoEnvio ({ enviadas, recusadas }, agendado) {
  const msg = enviadas.length ? `${enviadas.length} carta(s) ${agendado ? 'agendada(s)' : 'na fila de envio'}.` : ''
  const erro = recusadas.length
    ? `Não enviadas: ${recusadas.slice(0, 8).map(r => `#${numeroDe(r.id)} (${r.problemas.join(', ')})`).join('; ')}${recusadas.length > 8 ? ` e mais ${recusadas.length - 8}` : ''}`
    : ''
  return { msg: msg || (erro ? '' : 'Nenhuma carta para enviar.'), erro }
}

function apagarFoto (arquivo) {
  const emUso = db.prepare('SELECT 1 FROM cartas WHERE foto = ?').get(arquivo)
  if (!emUso) fs.rm(path.join(PASTA_FOTOS, arquivo), { force: true }, () => {})
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
const upload = multer({
  storage: multer.diskStorage({
    destination: PASTA_FOTOS,
    filename: (req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EXT[f.mimetype] || '.jpg'}`)
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 300 },
  fileFilter: (req, f, cb) => cb(null, Boolean(EXT[f.mimetype]))
})

export function iniciarPainel (wa) {
  WA = wa
  const app = express()

  // Ícone e manifesto ficam fora do login: o celular precisa deles para "Adicionar à tela inicial".
  const PUBLICO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'publico')
  app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json').send(JSON.stringify({
      name: 'CartaDex',
      short_name: 'CartaDex',
      description: 'Leilão de cartas no WhatsApp',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#131418',
      theme_color: '#131418',
      lang: 'pt-BR',
      icons: [
        { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    }))
  })
  app.get(['/icone-192.png', '/icone-512.png'], (req, res) => res.sendFile(path.join(PUBLICO, req.path.slice(1)), { maxAge: '30d' }))

  app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 50000 }))

  // ---------- Aviso do Mercado Pago (fora do login) ----------
  // O Mercado Pago chama este endereço quando um pagamento muda. Responde na hora e confere em segundo plano.
  // Na Cloudflare, só este caminho fica liberado do login por e-mail.
  const avisosPorIp = new Map()
  app.post('/mp/aviso', express.json({ limit: '32kb' }), (req, res) => {
    res.status(200).send('ok')
    const ip = ipDe(req); const agora = Date.now()
    const janela = (avisosPorIp.get(ip) || []).filter(t => t > agora - 60_000)
    janela.push(agora); avisosPorIp.set(ip, janela)
    if (avisosPorIp.size > 1000) avisosPorIp.clear()
    if (janela.length > 60) return // mais de 60 avisos por minuto do mesmo lugar: ignora
    const q = req.query || {}; const b = (req.body && typeof req.body === 'object') ? req.body : {}
    const tipo = b.type || q.type || q.topic
    const id = b.data?.id ?? q['data.id'] ?? (q.topic === 'payment' ? q.id : undefined)
    if (tipo !== 'payment' || !id) return
    avisoDoMP(id, wa)
      .then(r => { if (/^pago/.test(r)) console.log(`⚡ Aviso do Mercado Pago (pagamento ${id}): ${r}`) })
      .catch(e => console.error('Aviso do Mercado Pago:', e.message))
  })

  // ---------- Entrar, sair e esqueci a senha (fora do login) ----------
  const semCache = (req, res, next) => { res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Expires: '0' }); next() }
  const telaLogin = (res, corpo, status = 200) => res.status(status).send(P.paginaEntrada(corpo))

  app.get('/entrar', semCache, (req, res) => {
    const s = S.sessaoDe(req)
    if (s && USUARIOS.some(u => u.login === s.login)) { S.garantirMarca(req, res, s); return res.redirect(voltaSegura(req.query.volta)) }
    telaLogin(res, P.formEntrar({ volta: voltaSegura(req.query.volta), msg: req.query.msg, erro: req.query.erro, bot: wa.estado.conectado }))
  })
  app.post('/entrar', semCache, a(async (req, res) => {
    const ip = ipDe(req)
    const b = req.body
    const volta = voltaSegura(b.volta)
    const nomeLogin = typeof b.usuario === 'string' ? b.usuario.trim().toLowerCase().slice(0, 40) : ''
    const minutos = limitador.bloqueado(ip) || limitadorLogin.bloqueado(nomeLogin)
    if (minutos) return telaLogin(res, P.formEntrar({ usuario: nomeLogin, volta, erro: `Muitas senhas erradas. Tente de novo em ${minutos} min.`, bot: wa.estado.conectado }), 429)
    const usuario = await S.entrar(USUARIOS, b.usuario, b.senha)
    if (!usuario) {
      if (nomeLogin) limitadorLogin.falhou(nomeLogin)
      const travou = limitador.falhou(ip)
      registrarAtividade(String(b.usuario || '').slice(0, 40), travou ? 'bloqueio' : 'falha', travou ? 'Endereço bloqueado por 30 min (muitas senhas erradas)' : 'Senha errada', ip)
      return telaLogin(res, P.formEntrar({ usuario: nomeLogin, volta, erro: travou ? 'Muitas senhas erradas. Tente de novo em 30 min.' : 'Usuário ou senha incorretos.', bot: wa.estado.conectado }), travou ? 429 : 401)
    }
    limitador.acertou(ip)
    limitadorLogin.acertou(usuario.login)
    S.criarSessao(req, res, usuario.login, b.lembrar === '1')
    registrarAtividade(usuario.nome, 'entrada', 'Entrou no painel', ip)
    vistoEm.set(usuario.login + '|' + ip, Date.now())
    res.redirect(volta)
  }))
  app.post('/sair', (req, res) => {
    const s = S.sessaoDe(req)
    const u = s && USUARIOS.find(x => x.login === s.login)
    S.sair(req, res)
    if (u) registrarAtividade(u.nome, 'acao', 'Saiu do painel', ipDe(req))
    res.redirect('/entrar?msg=' + encodeURIComponent('Você saiu do painel.'))
  })

  // Esqueci a senha: o bot manda um código de 6 números pelo WhatsApp (da pessoa ou do administrador).
  app.get('/esqueci', semCache, (req, res) => telaLogin(res, P.formEsqueci({ usuario: req.query.u, erro: req.query.erro, bot: wa.estado.conectado })))
  app.post('/esqueci', semCache, a(async (req, res) => {
    const ip = ipDe(req)
    const login = String(req.body.usuario || '').trim().toLowerCase().slice(0, 40)
    if (!login) return telaLogin(res, P.formEsqueci({ erro: 'Digite o seu usuário.', bot: wa.estado.conectado }), 400)
    if (limitador.bloqueado(ip)) return telaLogin(res, P.formEsqueci({ usuario: login, erro: 'Muitas tentativas. Tente de novo mais tarde.', bot: wa.estado.conectado }), 429)
    if (!wa.estado.conectado) return telaLogin(res, P.formEsqueci({ usuario: login, erro: 'O bot está desconectado do WhatsApp, então não dá para mandar o código agora. Fale com o administrador.', bot: false }), 503)
    const usuario = USUARIOS.find(u => u.login === login)
    if (usuario) {
      if (!S.podePedirCodigo(login)) {
        registrarAtividade(usuario.nome, 'falha', 'Pediu código de acesso demais (limite por hora)', ip)
        return telaLogin(res, P.formEsqueci({ usuario: login, erro: `Já foram pedidos ${S.PEDIDOS_POR_HORA} códigos na última hora. Espere um pouco.`, bot: true }), 429)
      }
      const proprio = S.telefoneDe(login)
      const admin = proprio ? null : S.adminDosCodigos(USUARIOS)
      const para = proprio || (admin && S.telefoneDe(admin.login))
      if (para) {
        const codigo = S.gerarCodigo(login)
        try {
          await wa.enviarTexto(S.textoCodigo(codigo, usuario, !proprio), [], para + '@s.whatsapp.net')
          registrarAtividade(usuario.nome, 'acao', `Pediu código de acesso (mandado para ${proprio ? 'o próprio WhatsApp' : `o WhatsApp de ${admin.nome}`})`, ip)
        } catch (e) {
          console.error('Código de acesso: não consegui mandar:', e.message)
          return telaLogin(res, P.formEsqueci({ usuario: login, erro: 'Não consegui mandar o código pelo WhatsApp. Tente de novo em instantes.', bot: true }), 502)
        }
      } else {
        registrarAtividade(usuario.nome, 'falha', 'Pediu código de acesso, mas ninguém tem WhatsApp cadastrado', ip)
      }
    } else {
      limitador.falhou(ip)
    }
    // A resposta é a mesma exista o usuário ou não (para não revelar quem existe).
    res.redirect('/esqueci/codigo?u=' + encodeURIComponent(login))
  }))
  app.get('/esqueci/codigo', semCache, (req, res) => telaLogin(res, P.formCodigo({ usuario: String(req.query.u || '').slice(0, 40), erro: req.query.erro })))
  app.post('/esqueci/codigo', semCache, (req, res) => {
    const ip = ipDe(req)
    const b = req.body
    const login = String(b.usuario || '').trim().toLowerCase().slice(0, 40)
    const volta = erro => telaLogin(res, P.formCodigo({ usuario: login, erro }), 400)
    if (limitador.bloqueado(ip)) return volta('Muitas tentativas. Tente de novo mais tarde.')
    const prob = S.problemaSenha(b.nova, b.confirma)
    if (prob) return volta(prob)
    const usuario = USUARIOS.find(u => u.login === login)
    const r = usuario ? S.conferirCodigo(login, b.codigo) : 'errado'
    if (r !== 'ok') {
      limitador.falhou(ip)
      if (usuario) registrarAtividade(usuario.nome, 'falha', 'Código de acesso errado', ip)
      return volta(r === 'expirado' ? 'Esse código venceu ou já foi usado. Peça um novo.' : 'Código errado. Confira a mensagem no WhatsApp.')
    }
    limitador.acertou(ip)
    S.trocarSenha(login, b.nova)
    S.derrubarOutras(login)
    S.criarSessao(req, res, login, false)
    registrarAtividade(usuario.nome, 'acao', 'Trocou a senha com código de acesso', ip)
    res.redirect('/?msg=' + encodeURIComponent('Senha nova criada. Você já está dentro do painel.'))
  })

  app.use(exigirLogin)
  // Páginas do painel nunca ficam guardadas no navegador: ao voltar/avançar depois de sair, ele pergunta de novo ao servidor.
  app.use((req, res, next) => { if (!req.path.startsWith('/fotos/')) res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Expires: '0' }); next() })
  app.use(registrarAcoes)
  app.use('/fotos', express.static(PASTA_FOTOS, { maxAge: '7d' }))

  // ---------- Início (atalhos para tudo) ----------
  const avisosDoPainel = () => {
    const b = statusBackup()
    const erros = db.prepare(`SELECT c.id, c.numero, c.lote_id, c.erro, l.nome lote FROM cartas c JOIN lotes l ON l.id = c.lote_id
      WHERE c.erro IS NOT NULL AND c.status IN ('pendente','fila') ORDER BY c.id DESC LIMIT 8`).all()
    return P.avisosGerais({
      conectado: wa.estado.conectado,
      grupos: listarGruposDoBot(),
      backupFalhou: cfg('backup_ativo') === '1' && b && !b.ok ? b.msg || 'erro' : '',
      erros
    })
  }

  app.get('/usuarios', (req, res) => {
    const ultimo = db.prepare("SELECT MAX(ts) ts FROM atividade WHERE usuario = ? AND tipo IN ('entrada','acao')")
    const acoes = db.prepare("SELECT COUNT(*) n FROM atividade WHERE usuario = ? AND tipo = 'acao' AND ts > ?")
    const equipe = USUARIOS.map(u => ({
      nome: u.nome,
      voce: u.login === req.usuario?.login,
      ultimo: Math.max(ultimoAcesso(u.login), ultimo.get(u.nome).ts || 0) || null,
      acoesHoje: acoes.get(u.nome, Date.now() - 86400_000).n,
      login: u.login,
      whats: S.telefoneDe(u.login),
      senhaNova: S.temSenhaNova(u.login)
    }))
    const admin = S.adminDosCodigos(USUARIOS)
    pagina(req, res, 'Usuários', P.paginaUsuarios(equipe, {
      admin: admin?.login || '', escolhido: cfg('codigo_admin') || '', aparelhos: S.sessoesAtivas(req.usuario.login), minima: S.SENHA_MINIMA
    }), '/usuarios')
  })

  // WhatsApp de cada pessoa (para o código de acesso) e quem recebe o código de quem não tem número.
  // Como o número decide para onde vai o código de troca de senha, mudar exige a senha de quem está mudando,
  // e o número antigo recebe um aviso.
  app.post('/usuarios/whats', a(async (req, res) => {
    const ip = ipDe(req)
    if (limitador.bloqueado(ip)) return volta(res, '/usuarios', { erro: 'Muitas senhas erradas. Tente de novo mais tarde.' })
    if (!(await S.senhaValida(req.usuario, req.body.senha))) {
      limitador.falhou(ip)
      registrarAtividade(req.usuario.nome, 'falha', 'Senha errada ao mudar o WhatsApp da equipe', ip)
      return volta(res, '/usuarios', { erro: 'Senha errada. Nada foi mudado.' })
    }
    const tel = req.body.tel && typeof req.body.tel === 'object' && !Array.isArray(req.body.tel) ? req.body.tel : {}
    const ruins = []; const mudou = []
    for (const u of USUARIOS) {
      if (!(u.login in tel) || typeof tel[u.login] !== 'string') continue
      const novo = S.limparTelefone(tel[u.login])
      if (tel[u.login].trim() && (novo.length < 12 || novo.length > 13)) { ruins.push(u.nome); continue }
      const antes = S.telefoneDe(u.login)
      if (novo === antes) continue
      S.salvarTelefone(u.login, novo)
      mudou.push(u.nome)
      if (antes && wa.estado.conectado) {
        wa.enviarTexto(`🔐 *CartaDex*: o WhatsApp do usuário ${u.nome} no painel foi trocado por ${req.usuario.nome}${novo ? ` para ${S.mascarar(novo)}` : ' (removido)'}. Se não foi combinado, avise a equipe.`, [], antes + '@s.whatsapp.net')
          .catch(e => console.error('Aviso de troca de WhatsApp:', e.message))
      }
    }
    if (typeof req.body.codigo_admin === 'string' && USUARIOS.some(u => u.login === req.body.codigo_admin)) setCfg('codigo_admin', req.body.codigo_admin)
    if (mudou.length) registrarAtividade(req.usuario.nome, 'acao', `Mudou o WhatsApp de ${mudou.join(', ')}`, ip)
    volta(res, '/usuarios', ruins.length ? { erro: `Confira o número de ${ruins.join(', ')} (use DDD + número, ex.: 47 99999-0000).${mudou.length ? ' Os outros foram salvos.' : ''}` } : { msg: 'WhatsApp da equipe salvo.' })
  }))

  // Trocar a própria senha (pede a atual). Os outros aparelhos saem.
  app.post('/usuarios/senha', a(async (req, res) => {
    const b = req.body
    const ip = ipDe(req)
    if (limitador.bloqueado(ip)) return volta(res, '/usuarios', { erro: 'Muitas senhas erradas. Tente de novo mais tarde.' })
    if (!(await S.senhaValida(req.usuario, b.atual))) {
      limitador.falhou(ip)
      registrarAtividade(req.usuario.nome, 'falha', 'Senha atual errada ao trocar a senha', ip)
      return volta(res, '/usuarios', { erro: 'A senha atual está errada.' })
    }
    const prob = S.problemaSenha(b.nova, b.confirma)
    if (prob) return volta(res, '/usuarios', { erro: prob })
    S.trocarSenha(req.usuario.login, b.nova)
    const n = S.derrubarOutras(req.usuario.login, req.sessao?.token)
    volta(res, '/usuarios', { msg: `Senha trocada.${n ? ` ${n} outro(s) aparelho(s) foram desconectados.` : ''}` })
  }))

  app.post('/usuarios/sair-outros', (req, res) => {
    const n = S.derrubarOutras(req.usuario.login, req.sessao?.token)
    volta(res, '/usuarios', { msg: n ? `${n} outro(s) aparelho(s) desconectados.` : 'Nenhum outro aparelho estava conectado.' })
  })

  app.get('/mais', (req, res) => res.redirect('/'))

  // ---------- Quadro (todas as etapas) ----------
  app.get('/quadro', (req, res) => res.redirect('/'))
  app.get('/', (req, res) => {
    const cont = contagem()
    const base = 'SELECT c.*, l.nome lote FROM cartas c JOIN lotes l ON l.id = c.lote_id'
    const pendentes = db.prepare(`${base} WHERE c.status = 'pendente' ORDER BY c.lote_id, c.numero`).all()
    const lotesPendentes = db.prepare(`SELECT c.lote_id, l.nome, COUNT(*) n FROM cartas c JOIN lotes l ON l.id = c.lote_id
      WHERE c.status = 'pendente' GROUP BY c.lote_id ORDER BY c.lote_id`).all()
    const fila = db.prepare(`${base} WHERE c.status IN ('fila','agendada')
      ORDER BY c.status = 'agendada', COALESCE(c.na_fila_em, c.enviar_em), c.id`).all()
    const noAr = db.prepare(`${base} WHERE c.status = 'no_ar' ORDER BY c.lote_id, c.numero`).all()
      .map(c => ({ ...c, lider: liderAtual(c), votos: contarVotos(c.id) }))
    const vendidas = db.prepare(`${base} WHERE c.status = 'vendida' AND c.remessa_id IS NULL AND c.remessa_apagada IS NULL ORDER BY c.encerrada_em DESC`).all()
    const semLance = db.prepare(`${base} WHERE c.status = 'sem_lance' ORDER BY c.encerrada_em DESC`).all()

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const seteDias = hoje.getTime() - 6 * 86_400_000
    const encerradas = db.prepare(`SELECT SUM(status = 'vendida') v, COUNT(*) n FROM cartas
      WHERE status IN ('vendida','sem_lance') AND encerrada_em >= ? AND fora_relatorio IS NULL`).get(seteDias)
    const resumo = {
      hoje: db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_venda), 0) t FROM cartas WHERE status = 'vendida' AND encerrada_em >= ? AND fora_relatorio IS NULL").get(hoje.getTime()),
      aReceber: db.prepare(SQL_A_RECEBER).get().v,
      taxa: encerradas.n ? encerradas.v / encerradas.n : null
    }
    const erros = db.prepare(`SELECT c.id, c.numero, c.lote_id, c.erro, l.nome lote FROM cartas c JOIN lotes l ON l.id = c.lote_id
      WHERE c.erro IS NOT NULL AND c.status IN ('pendente','fila') ORDER BY c.id DESC LIMIT 8`).all()

    pagina(req, res, 'Quadro', P.paginaQuadro({
      conectado: wa.estado.conectado,
      grupos: listarGruposDoBot(),
      backupFalhou: (() => { const b = statusBackup(); return cfg('backup_ativo') === '1' && b && !b.ok ? b.msg || 'erro' : '' })(),
      pausada: cfg('fila_pausada') === '1',
      erros,
      cont,
      enviandoId: wa.estado.enviando || null,
      pendentes,
      lotesPendentes,
      fila,
      noAr,
      vendidas,
      semLance,
      resumo
    }), '/', { semTitulo: true })
  })

  // Pausar e retomar a fila direto do Quadro.
  app.post('/fila/pausar', (req, res) => {
    setCfg('fila_pausada', '1')
    volta(res, '/', { msg: 'Fila pausada. As cartas ficam esperando até você retomar.' })
  })
  app.post('/fila/retomar', (req, res) => {
    setCfg('fila_pausada', '0')
    volta(res, '/', { msg: 'Fila retomada.' })
  })

  // ---------- Status ao vivo (usado pela barra do topo) ----------
  // ---------- Tempo real ----------
  // Cada tela aberta fica "escutando" este endereço. Uma vez por segundo o bot tira uma "foto" rápida do
  // que importa (votos, situação das cartas, pagamentos, WhatsApp, fila) e, se algo mudou, avisa as telas,
  // que buscam as novidades na hora. Só trabalha enquanto tem alguma tela aberta.
  const ouvintes = new Set()
  let marcaAnterior = ''
  const marcaAtual = () => JSON.stringify([
    db.prepare('SELECT COUNT(*) n, COALESCE(MAX(alterado), 0) a, COALESCE(SUM(opcao), 0) s FROM votos').get(),
    db.prepare('SELECT COUNT(*) n, COALESCE(MAX(ts), 0) t FROM votos_retirados').get(),
    db.prepare('SELECT status, COUNT(*) n FROM cartas GROUP BY status ORDER BY status').all(),
    db.prepare('SELECT status, COUNT(*) n FROM cobrancas GROUP BY status ORDER BY status').all(),
    db.prepare('SELECT COUNT(*) n, COALESCE(MAX(rastreio_ultimo_em), 0) t FROM remessas').get(),
    versaoDados(),
    wa?.estado?.conectado, wa?.estado?.enviando, cfg('fila_pausada')
  ])
  const avisar = texto => { for (const r of ouvintes) { try { r.write(texto) } catch { ouvintes.delete(r) } } }
  setInterval(() => {
    if (!ouvintes.size) { marcaAnterior = ''; return }
    let m = ''
    try { m = marcaAtual() } catch { return }
    if (m !== marcaAnterior) { const primeira = !marcaAnterior; marcaAnterior = m; if (!primeira) avisar('data: mudou\n\n') }
  }, 1000).unref?.()
  // Mantém a conexão viva (a Cloudflare corta conexões paradas depois de um tempo).
  setInterval(() => { if (ouvintes.size) avisar(': ping\n\n') }, 25_000).unref?.()

  app.get('/api/eventos', (req, res) => {
    if (ouvintes.size >= 30) return res.status(503).send('muitas telas abertas')
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' })
    res.flushHeaders?.()
    res.write('retry: 5000\n\n')
    ouvintes.add(res)
    req.on?.('close', () => ouvintes.delete(res))
  })

  app.get('/api/status', (req, res) => {
    const cont = contagem()
    const ids = String(req.query.ids || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500)
    const st = db.prepare('SELECT * FROM cartas WHERE id = ?')
    const cartas = ids.map(id => st.get(id)).filter(Boolean).map(c => {
      const l = c.status === 'no_ar' ? liderAtual(c) : null
      return {
        id: c.id,
        status: c.status,
        lider: l ? P.nomeCurto(l.votante) : '',
        valor: l ? moeda(l.valor) : '',
        valorCurto: l ? P.reaisCurto(l.valor) : '',
        arremate: l?.tipo === 'arremate',
        votos: c.status === 'no_ar' ? contarVotos(c.id) : 0,
        erro: c.erro || ''
      }
    })
    res.set('Cache-Control', 'no-store').json({
      conectado: wa.estado.conectado,
      grupos: (() => { const t = listarGruposDoBot(); const p = t.filter(g => g.pausado).length; return { total: t.length, ativos: t.length - p, pausados: p } })(),
      enviando: wa.estado.enviando ? numeroDe(wa.estado.enviando) : null,
      fila: cont.fila || 0,
      pausada: cfg('fila_pausada') === '1',
      noAr: cont.no_ar || 0,
      dados: versaoDados(),
      cont,
      cartas
    })
  })

  app.get('/atividade', (req, res) => {
    const filtro = ['entrada', 'acao', 'falha'].includes(req.query.tipo) ? req.query.tipo : ''
    const pessoa = USUARIOS.find(u => u.login === String(req.query.quem || '').toLowerCase())?.nome || ''
    const cond = []; const args = []
    if (filtro === 'falha') cond.push("tipo IN ('falha','bloqueio')")
    else if (filtro) { cond.push('tipo = ?'); args.push(filtro) }
    if (pessoa) { cond.push('usuario = ?'); args.push(pessoa) }
    const itens = db.prepare(`SELECT * FROM atividade ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY ts DESC, id DESC LIMIT 200`).all(...args)
    pagina(req, res, pessoa ? `Atividade de ${pessoa}` : 'Atividade', P.paginaAtividade(itens, { filtro, pessoa, usuarios: USUARIOS.map(u => u.nome) }), '/atividade')
  })

  app.post('/atividade/limpar', (req, res) => {
    const oque = String(req.body.oque || '')
    let r
    if (oque === 'falhas') r = db.prepare("DELETE FROM atividade WHERE tipo IN ('falha','bloqueio')").run()
    else if (oque === '7' || oque === '30') r = db.prepare('DELETE FROM atividade WHERE ts < ?').run(Date.now() - Number(oque) * 86400_000)
    else if (oque === 'tudo') r = db.prepare('DELETE FROM atividade').run()
    else return volta(res, '/atividade', { erro: 'Escolha o que limpar.' })
    const n = Number(r.changes)
    volta(res, '/atividade', { msg: n ? `${n} ${n === 1 ? 'registro apagado' : 'registros apagados'}.` : 'Nada para apagar.' })
  })

  // ---------- Backup ----------
  app.get('/backup', a(async (req, res) => {
    const c = todasCfg()
    pagina(req, res, 'Backup', P.paginaBackup({
      c,
      status: statusBackup(),
      rodando: backupRodando(),
      situacao: await situacaoRclone(c.backup_remoto),
      locais: listarBackupsLocais(),
      manter: MANTER_NO_SERVIDOR
    }), '/backup')
  }))

  app.post('/backup', (req, res) => {
    const b = req.body
    const remoto = String(b.backup_remoto || '').trim()
    if (!/^[A-Za-z0-9_.-]+:[^\s]*$/.test(remoto)) return volta(res, '/config/backup', { erro: 'A pasta do Drive precisa ser no formato gdrive:CartaDex' })
    const hora = Math.min(23, Math.max(0, Math.round(Number(b.backup_hora)) || 0))
    const dias = [7, 15, 30, 60, 90].includes(Number(b.backup_dias)) ? Number(b.backup_dias) : 30
    setCfg('backup_ativo', b.backup_ativo === '1' ? '1' : '0')
    setCfg('backup_fotos', b.backup_fotos === '1' ? '1' : '0')
    setCfg('backup_hora', hora)
    setCfg('backup_dias', dias)
    setCfg('backup_remoto', remoto)
    volta(res, '/config/backup', { msg: 'Backup salvo.' })
  })

  app.post('/backup/agora', (req, res) => {
    if (backupRodando()) return volta(res, '/backup', { msg: 'O backup já está em andamento.' })
    fazerBackup().catch(e => console.error('Erro no backup:', e))
    volta(res, '/backup', { msg: 'Backup iniciado.' })
  })

  // ---------- Relatórios ----------
  app.get('/relatorios', (req, res) => {
    const r = gerarRelatorio(String(req.query.periodo || '30'))
    pagina(req, res, 'Relatórios', P.paginaRelatorios(r, PERIODOS), '/relatorios')
  })

  // ---------- Conexão ----------
  app.get('/conexao', (req, res) => res.redirect(wa.estado.conectado ? '/grupos' : '/whatsapp'))
  app.get('/grupos', a(async (req, res) => {
    let grupos = []
    try { grupos = await wa.listarGrupos() } catch (e) { console.error('Erro ao listar grupos:', e.message) }
    for (const g of grupos) if (grupoDoBot(g.id)) renomearGrupo(g.id, g.nome) // mantém os nomes atualizados
    const noAr = db.prepare("SELECT p.grupo_jid, COUNT(*) n FROM postagens p JOIN cartas c ON c.id = p.carta_id WHERE c.status IN ('no_ar','fila') GROUP BY p.grupo_jid").all()
    pagina(req, res, 'Grupos', P.paginaGrupos({
      conectado: wa.estado.conectado, grupos, doBot: listarGruposDoBot(), aoVivo: Object.fromEntries(noAr.map(r => [r.grupo_jid, r.n])), c: todasCfg()
    }), '/grupos')
  }))
  app.get('/whatsapp', a(async (req, res) => {
    let grupos = []
    if (wa.estado.conectado) { try { grupos = await wa.listarGrupos() } catch {} }
    const qrImg = wa.estado.qr ? await QRCode.toDataURL(wa.estado.qr, { width: 260, margin: 1 }) : ''
    pagina(req, res, 'WhatsApp', P.paginaWhatsapp({ conectado: wa.estado.conectado, eu: wa.estado.eu, qrImg, ultimoErro: wa.estado.ultimoErro, grupos: grupos.length }), '/whatsapp')
  }))

  // Os valores chegam como "jid|nome do grupo".
  const separar = v => { const t = String(v || ''); const i = t.indexOf('|'); return i < 0 ? [t.trim(), ''] : [t.slice(0, i).trim(), t.slice(i + 1)] }
  const jidGrupo = b => separar(b.id)[0]

  app.post('/conexao/grupo', (req, res) => {
    const marcados = (Array.isArray(req.body.id) ? req.body.id : [req.body.id]).filter(Boolean).map(separar)
    const ok = marcados.filter(([jid, nome]) => adicionarGrupo(jid, nome))
    volta(res, '/grupos', ok.length ? { msg: ok.length === 1 ? `Grupo adicionado: ${ok[0][1]}` : `${ok.length} grupos adicionados.` } : { erro: 'Marque pelo menos um grupo.' })
  })

  app.post('/conexao/grupo/pausar', (req, res) => {
    const g = grupoDoBot(jidGrupo(req.body))
    if (!g) return volta(res, '/grupos', { erro: 'Grupo não encontrado.' })
    pausarGrupo(g.jid, true)
    volta(res, '/grupos', { msg: `${g.nome || 'Grupo'} pausado. Ele não recebe cartas novas até você retomar.` })
  })

  app.post('/conexao/grupo/retomar', (req, res) => {
    const g = grupoDoBot(jidGrupo(req.body))
    if (!g) return volta(res, '/grupos', { erro: 'Grupo não encontrado.' })
    pausarGrupo(g.jid, false)
    volta(res, '/grupos', { msg: `${g.nome || 'Grupo'} voltou a receber cartas.` })
  })

  // Fechar (só administradores mandam mensagem) e abrir um grupo.
  for (const [rota, fechar] of [['fechar', true], ['abrir', false]]) {
    app.post(`/conexao/grupo/${rota}`, a(async (req, res) => {
      const g = grupoDoBot(jidGrupo(req.body))
      if (!g) return volta(res, '/grupos', { erro: 'Grupo não encontrado.' })
      const { feitos, falhas } = await mudarGrupos([g.jid], fechar)
      volta(res, '/grupos', feitos.length
        ? { msg: fechar ? `${g.nome || 'Grupo'} fechado: só administradores mandam mensagem.` : `${g.nome || 'Grupo'} aberto: todo mundo pode mandar mensagem.` }
        : { erro: `Não consegui ${rota} ${g.nome || 'o grupo'}: ${falhas.join('; ').replace(/^[^:]*: /, '')}` })
    }))
  }

  for (const [rota, fechar] of [['fechar-todos', true], ['abrir-todos', false]]) {
    app.post(`/conexao/${rota}`, a(async (req, res) => {
      const jids = listarGruposDoBot().map(g => g.jid)
      if (!jids.length) return volta(res, '/grupos', { erro: 'Nenhum grupo no leilão.' })
      let estados = {}
      try { estados = Object.fromEntries((await wa.listarGrupos()).map(g => [g.id, g])) } catch {}
      const { feitos, falhas } = await mudarGrupos(jids, fechar, { estados })
      const msg = feitos.length ? `${feitos.length} grupo(s) ${fechar ? 'fechado(s)' : 'aberto(s)'}.` : (falhas.length ? '' : `Os grupos já estavam ${fechar ? 'fechados' : 'abertos'}.`)
      volta(res, '/grupos', { msg, erro: falhas.length ? `Não deu em: ${falhas.join('; ')}` : '' })
    }))
  }

  app.post('/conexao/horario', (req, res) => {
    const b = req.body
    const hora = p => {
      const h = Math.min(23, Math.max(0, Math.round(Number(b[p + '_h'])) || 0))
      const m = Math.min(59, Math.max(0, Math.round(Number(b[p + '_m'])) || 0))
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    const fechar = hora('horario_fechar'); const abrir = hora('horario_abrir')
    if (fechar === abrir) return volta(res, '/config/grupos', { erro: 'O horário de fechar precisa ser diferente do de abrir.' })
    setCfg('horario_ativo', b.horario_ativo === '1' ? '1' : '0')
    setCfg('horario_fechar', fechar)
    setCfg('horario_abrir', abrir)
    setCfg('horario_msg_fechar', String(b.horario_msg_fechar || '').trim())
    setCfg('horario_msg_abrir', String(b.horario_msg_abrir || '').trim())
    volta(res, '/config/grupos', { msg: b.horario_ativo === '1' ? `Horário salvo: fecha às ${fechar} e abre às ${abrir}.` : 'Horário automático desligado.' })
  })

  app.post('/conexao/grupo/remover', (req, res) => {
    const g = grupoDoBot(jidGrupo(req.body))
    if (!g) return volta(res, '/grupos', { erro: 'Grupo não encontrado.' })
    removerGrupo(g.jid)
    volta(res, '/grupos', { msg: `${g.nome || 'Grupo'} removido do leilão. O bot continua no grupo do WhatsApp.` })
  })

  app.post('/conexao/grupo/sair', a(async (req, res) => {
    const [jid, nomeForm] = req.body.sair_id ? separar(req.body.sair_id) : separar(req.body.id)
    if (!jid.endsWith('@g.us')) return volta(res, '/grupos', { erro: 'Grupo inválido.' })
    const nome = grupoDoBot(jid)?.nome || nomeForm || 'Grupo'
    try {
      await wa.sairDoGrupo(jid)
    } catch (e) {
      return volta(res, '/grupos', { erro: `Não consegui sair de ${nome}: ${e.message}` })
    }
    removerGrupo(jid)
    volta(res, '/grupos', { msg: `O bot saiu de ${nome}.` })
  }))

  // ---------- Lotes ----------
  app.get('/lotes', (req, res) => {
    const lotes = db.prepare(`SELECT l.id, l.nome, COUNT(c.id) total,
      SUM(c.status='pendente') pendente, SUM(c.status='agendada') agendada, SUM(c.status='fila') fila,
      SUM(c.status='no_ar') no_ar, SUM(c.status='vendida') vendida, SUM(c.status='sem_lance') sem_lance,
      l.criado_em, COALESCE(SUM(CASE WHEN c.status = 'vendida' THEN c.valor_venda END), 0) vendido
      FROM lotes l LEFT JOIN cartas c ON c.lote_id = l.id WHERE l.oculto IS NULL GROUP BY l.id ORDER BY l.id DESC`).all()
    const fotos = db.prepare('SELECT foto FROM cartas WHERE lote_id = ? ORDER BY id LIMIT 3')
    for (const l of lotes) l.fotos = fotos.all(l.id).map(r => r.foto)
    pagina(req, res, 'Lotes', P.paginaLotes(lotes), '/lotes')
  })

  app.post('/lotes', (req, res) => {
    const nome = String(req.body.nome || '').trim() || 'Lote sem nome'
    const id = db.prepare('INSERT INTO lotes (nome, criado_em) VALUES (?, ?)').run(nome, Date.now()).lastInsertRowid
    volta(res, `/lotes/${id}`, { msg: 'Lote criado. Agora adicione as fotos das cartas.' })
  })

  const pegarLote = id => db.prepare('SELECT * FROM lotes WHERE id = ? AND oculto IS NULL').get(Number(id))

  app.get('/lotes/:id', (req, res) => {
    const lote = pegarLote(req.params.id)
    if (!lote) return volta(res, '/lotes', { erro: 'Lote não encontrado' })
    const cartas = db.prepare('SELECT * FROM cartas WHERE lote_id = ? ORDER BY id').all(lote.id)
    const lideres = Object.fromEntries(cartas.filter(c => c.status === 'no_ar').map(c => [c.id, liderAtual(c)]))
    pagina(req, res, lote.nome, P.paginaLote(lote, cartas, lideres, votosDe(cartas), cfg('previa_texto'), listarGruposDoBot(), String(req.query.aba || ''), Number(req.query.editar) || 0, String(req.query.novas || '')), '/lotes', { voltar: ['/lotes', 'Lotes'], semTitulo: true })
  })

  // Volta para o lote na mesma aba em que a pessoa estava.
  const urlLote = (id, req, extra = '') => `/lotes/${id}${P.ABAS_LOTE.some(x => x[0] === req.body?.aba) ? `?aba=${req.body.aba}` : ''}${extra ? (P.ABAS_LOTE.some(x => x[0] === req.body?.aba) ? '&' : '?') + extra : ''}`
  const doLote = (id, aba) => {
    const st = (P.ABAS_LOTE.find(x => x[0] === aba) || P.ABAS_LOTE[0])[2]
    return db.prepare(`SELECT id FROM cartas WHERE lote_id = ? AND status IN (${st.map(() => '?').join(',')}) ORDER BY id`).all(id, ...st).map(r => r.id)
  }

  app.post('/lotes/:id/fotos', upload.array('fotos', 300), (req, res) => {
    const lote = pegarLote(req.params.id)
    const arquivos = [...(req.files || [])].sort((x, y) => x.originalname.localeCompare(y.originalname, 'pt-BR', { numeric: true }))
    if (!lote) { arquivos.forEach(f => fs.rm(f.path, { force: true }, () => {})); return volta(res, '/lotes', { erro: 'Lote não encontrado' }) }
    if (!arquivos.length) return volta(res, `/lotes/${lote.id}`, { erro: 'Nenhuma foto válida (use JPG, PNG ou WEBP).' })
    const b = req.body
    // Os valores não vêm daqui: depois de adicionar, o lote abre a janela de valores já com as cartas novas marcadas.
    const st = db.prepare('INSERT INTO cartas (lote_id, foto, descricao, v1, v2, v3, arremate) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const ids = []
    transacao(() => {
      for (const f of arquivos) ids.push(Number(st.run(lote.id, f.filename, String(b.descricao || '').trim(), lerValor(b.v1), lerValor(b.v2), lerValor(b.v3), lerValor(b.arremate)).lastInsertRowid))
    })
    const n = arquivos.length
    volta(res, `/lotes/${lote.id}?aba=enviar&novas=${Math.min(...ids)}-${Math.max(...ids)}`, { msg: `${n} ${n === 1 ? 'carta adicionada' : 'cartas adicionadas'}. Agora defina os lances e o arremate.` })
  })

  app.post('/lotes/:id/salvar', (req, res) => {
    const n = salvarEdicoes(req.body.c)
    const prox = Number(req.body.proxima) || 0
    volta(res, urlLote(req.params.id, req, prox ? `editar=${prox}` : ''), { msg: n === 1 ? 'Carta salva.' : `${n} carta(s) salva(s).` })
  })

  app.post('/lotes/:id/enviar', (req, res) => {
    const lote = pegarLote(req.params.id)
    if (!lote) return volta(res, '/lotes', { erro: 'Lote não encontrado' })
    salvarEdicoes(req.body.c)
    let ids = lista(req.body.sel)
    if (!ids.length) ids = doLote(lote.id, req.body.aba === 'semlance' ? 'semlance' : 'enviar')
    else ids = ids.filter(id => db.prepare('SELECT 1 FROM cartas WHERE id = ? AND lote_id = ?').get(id, lote.id))
    const { destino, erro } = lerDestino(req.body.destino)
    if (erro) return volta(res, urlLote(lote.id, req), { erro })
    const { enviarEm, encerraEm } = P.lerHorarios(req.body)
    const r = enfileirar(ids, { enviarEm, encerraEm, destino })
    volta(res, urlLote(lote.id, req), resumoEnvio(r, enviarEm && enviarEm > Date.now()))
  })

  // Aplica descrição e/ou valores a várias cartas de uma vez (só os campos preenchidos).
  app.post('/lotes/:id/aplicar', (req, res) => {
    const lote = pegarLote(req.params.id)
    if (!lote) return volta(res, '/lotes', { erro: 'Lote não encontrado' })
    salvarEdicoes(req.body.c)
    const b = req.body
    const mudar = {}
    if (String(b.m_descricao || '').trim()) mudar.descricao = String(b.m_descricao).trim()
    for (const k of ['v1', 'v2', 'v3', 'arremate']) {
      const v = lerValor(b['m_' + k])
      if (v) mudar[k] = v
    }
    if (!Object.keys(mudar).length) return volta(res, urlLote(lote.id, req), { erro: 'Preencha pelo menos um campo para aplicar.' })
    let ids = lista(b.sel)
    if (!ids.length) ids = doLote(lote.id, b.aba === 'semlance' ? 'semlance' : 'enviar')
    const sets = Object.keys(mudar).map(k => `${k} = ?`).join(', ')
    const st = db.prepare(`UPDATE cartas SET ${sets} WHERE id = ? AND lote_id = ? AND status IN ('pendente','agendada','sem_lance')`)
    let n = 0
    transacao(() => { for (const id of ids) n += Number(st.run(...Object.values(mudar), id, lote.id).changes) })
    volta(res, urlLote(lote.id, req), { msg: `Alterado em ${n} carta(s).` })
  })

  // Prévia: fotos sem enquete, para mostrar o que vai entrar no leilão.
  app.post('/lotes/:id/previa', (req, res) => {
    const lote = pegarLote(req.params.id)
    if (!lote) return volta(res, '/lotes', { erro: 'Lote não encontrado' })
    salvarEdicoes(req.body.c)
    if (!wa.estado.conectado) return volta(res, urlLote(lote.id, req), { erro: 'Conecte o WhatsApp antes de postar a prévia.' })
    const dest = lerDestino(req.body.previa_destino)
    if (dest.erro) return volta(res, urlLote(lote.id, req), { erro: dest.erro })
    const gruposPrevia = dest.destino ? JSON.parse(dest.destino) : gruposAtivos().map(g => g.jid)
    let ids = lista(req.body.sel)
    if (!ids.length) ids = db.prepare("SELECT id FROM cartas WHERE lote_id = ? AND status IN ('pendente','agendada','fila') ORDER BY id").all(lote.id).map(r => r.id)
    else ids = ids.filter(id => db.prepare('SELECT 1 FROM cartas WHERE id = ? AND lote_id = ?').get(id, lote.id))
    if (!ids.length) return volta(res, urlLote(lote.id, req), { erro: 'Nenhuma carta para a prévia. Marque as cartas ou deixe alguma pendente.' })
    const texto = textoPrevia(req.body.previa_texto, ids.length, String(req.body.previa_quando || '').trim())
    const { total, grupos } = enviarPrevia(ids, { texto, comValores: req.body.previa_valores === '1', grupos: gruposPrevia })
    volta(res, urlLote(lote.id, req), { msg: `Prévia com ${total} ${total === 1 ? 'carta' : 'cartas'} sendo postada em ${grupos} ${grupos === 1 ? 'grupo' : 'grupos'}.` })
  })

  app.post('/lotes/:id/cancelar', (req, res) => {
    let ids = lista(req.body.sel)
    if (!ids.length) ids = db.prepare("SELECT id FROM cartas WHERE lote_id = ? AND status IN ('fila','agendada')").all(Number(req.params.id)).map(r => r.id)
    volta(res, urlLote(req.params.id, req), { msg: `${cancelarEnvio(ids)} carta(s) tirada(s) da fila.` })
  })

  app.post('/lotes/:id/encerrar', a(async (req, res) => {
    let ids = lista(req.body.sel)
    if (!ids.length) ids = db.prepare("SELECT id FROM cartas WHERE lote_id = ? AND status = 'no_ar'").all(Number(req.params.id)).map(r => r.id)
    const r = await encerrarEAnunciar(ids)
    volta(res, urlLote(req.params.id, req), { msg: `${r.length} carta(s) encerrada(s): ${r.filter(x => x.vencedor).length} vendida(s).` })
  }))

  app.post('/lotes/:id/excluir-cartas', (req, res) => {
    const ids = lista(req.body.sel)
    let n = 0
    for (const id of ids) {
      const c = db.prepare("SELECT foto FROM cartas WHERE id = ? AND status NOT IN ('fila','no_ar')").get(id)
      if (!c) continue
      db.prepare('DELETE FROM cartas WHERE id = ?').run(id)
      apagarFoto(c.foto)
      n++
    }
    volta(res, urlLote(req.params.id, req), n < ids.length
      ? { msg: `${n} excluída(s).`, erro: 'Cartas na fila ou no ar não podem ser excluídas.' }
      : { msg: `${n} carta(s) excluída(s).` })
  })

  app.post('/lotes/:id/renomear', (req, res) => {
    db.prepare('UPDATE lotes SET nome = ? WHERE id = ?').run(String(req.body.nome || '').trim() || 'Lote sem nome', Number(req.params.id))
    volta(res, `/lotes/${req.params.id}`, { msg: 'Lote renomeado.' })
  })

  // ---------- No ar ----------
  app.get('/no-ar', (req, res) => {
    const cartas = db.prepare("SELECT * FROM cartas WHERE status = 'no_ar' ORDER BY enviada_em").all()
    const lideres = Object.fromEntries(cartas.map(c => [c.id, liderAtual(c)]))
    pagina(req, res, 'Ao vivo', P.paginaNoAr(cartas, lideres, votosDe(cartas)), '/no-ar')
  })

  app.post('/no-ar/encerrar', a(async (req, res) => {
    const r = await encerrarEAnunciar(lista(req.body.sel))
    volta(res, '/no-ar', { msg: `${r.length} carta(s) encerrada(s): ${r.filter(x => x.vencedor).length} vendida(s).` })
  }))

  // ---------- Sem lance (reenvio manual) ----------
  app.get('/sem-lance', (req, res) => {
    const cartas = db.prepare("SELECT * FROM cartas WHERE status = 'sem_lance' ORDER BY encerrada_em DESC").all()
    pagina(req, res, 'Sem lance', P.paginaSemLance(cartas, listarGruposDoBot()), '/sem-lance')
  })


  app.post('/sem-lance/reenviar', (req, res) => {
    let ids = lista(req.body.sel)
    if (!ids.length) ids = db.prepare("SELECT id FROM cartas WHERE status = 'sem_lance' ORDER BY lote_id, numero").all().map(r => r.id)
    const { destino, erro } = lerDestino(req.body.destino)
    if (erro) return volta(res, '/sem-lance', { erro })
    const { enviarEm, encerraEm } = P.lerHorarios(req.body)
    const r = enfileirar(ids, { enviarEm, encerraEm, destino })
    volta(res, '/sem-lance', resumoEnvio(r, enviarEm && enviarEm > Date.now()))
  })

  // ---------- Vendas e remessas ----------
  app.get('/vendas', (req, res) => {
    const vendidas = db.prepare("SELECT * FROM cartas WHERE status = 'vendida' AND remessa_id IS NULL AND remessa_apagada IS NULL ORDER BY vencedor, encerrada_em").all()
    const grupos = new Map()
    for (const c of vendidas) {
      if (!grupos.has(c.vencedor)) {
        const ct = db.prepare('SELECT nome, telefone FROM contatos WHERE jid = ?').get(c.vencedor) || {}
        grupos.set(c.vencedor, { comprador: c.vencedor, nome: ct.nome, telefone: ct.telefone, cartas: [], total: 0 })
      }
      const g = grupos.get(c.vencedor)
      g.cartas.push(c)
      g.total += c.valor_venda || 0
    }
    const pendentes = cobrancasPendentes()
    const resumo = {
      semRemessa: vendidas.reduce((t, c) => t + (c.valor_venda || 0), 0),
      aguardando: pendentes.reduce((t, b) => t + b.total, 0),
      cobrancas: pendentes.length,
      separar: db.prepare("SELECT COUNT(*) n FROM remessas WHERE status = 'pago'").get().n
    }
    const avisos = avisosDasCartas(vendidas.map(c => c.id))
    const pagas = Object.fromEntries(vendidas.map(c => [c.id, cobrancaDaCarta(c.id)?.status === 'pago']))
    pagina(req, res, 'Vendas', P.paginaVendas([...grupos.values()], resumo, avisos, pagas), '/vendas')
  })

  // ---------- Pagamentos ----------
  app.get('/pagamentos', (req, res) => {
    const cobrancas = {
      pendentes: cobrancasPendentes().map(b => ({ ...b, nome: nomeContato(b.jid), cartas: cartasDaCobranca(b.id), proximo: proximoLembrete(b) })),
      pagas: pagasRecentes(10).map(b => ({ ...b, nome: nomeContato(b.jid), cartas: cartasDaCobranca(b.id) })),
      mp: temMP(),
      lembretes: cfg('cobranca_ativo') === '1',
      horas: cfg('cobranca_horas')
    }
    pagina(req, res, 'Pagamentos', P.paginaPagamentos(cobrancas), '/pagamentos')
  })

  // ---------- Remessas ----------
  app.get('/remessas', (req, res) => {
    const remessas = db.prepare('SELECT * FROM remessas ORDER BY id DESC LIMIT 200').all().map(r => {
      const cartas = db.prepare('SELECT * FROM cartas WHERE remessa_id = ? ORDER BY id').all(r.id)
      const transp = r.rastreio ? transportadoraDe(r.rastreio, r.transportadora) : ''
      return { ...r, cartas, total: cartas.reduce((t, c) => t + (c.valor_venda || 0), 0), transp, leitura: ['correios', 'totalexpress', 'anjun'].includes(transp) }
    })
    pagina(req, res, 'Remessas', P.paginaRemessas(remessas, {
      marcos: MARCOS, transportadoras: TRANSPORTADORAS, temChave: Boolean(cfg('rastreio_chave')), usoMes: usoDoMes(), limite: Number(cfg('rastreio_limite')) || 950
    }), '/remessas')
  })

  // Cobranças: marcar como pago, parar de cobrar e conferir agora no Mercado Pago.
  app.post('/cobrancas/:id/pago', a(async (req, res) => {
    const ok = await marcarPago(Number(req.params.id), req.usuario?.nome || 'painel', { wa })
    volta(res, '/pagamentos', ok ? { msg: 'Cobrança marcada como paga. Os lembretes pararam.' } : { erro: 'Essa cobrança não está mais em aberto.' })
  }))
  app.post('/cobrancas/:id/lembrar', a(async (req, res) => {
    try {
      await lembrarAgora(wa, Number(req.params.id))
      volta(res, '/pagamentos', { msg: 'Lembrete mandado agora.' })
    } catch (e) {
      volta(res, '/pagamentos', { erro: `Não mandei o lembrete: ${e.message}` })
    }
  }))
  app.post('/cobrancas/:id/cancelar', (req, res) => {
    const ok = cancelarCobranca(Number(req.params.id), req.usuario?.nome || 'painel')
    volta(res, '/pagamentos', ok ? { msg: 'Cobrança parada. O bot não manda mais lembretes para ela.' } : { erro: 'Essa cobrança não está mais em aberto.' })
  })
  app.post('/cobrancas/verificar', a(async (req, res) => {
    if (!temMP()) return volta(res, '/pagamentos', { erro: 'Coloque o Access Token do Mercado Pago em Configurações para o bot conferir sozinho.' })
    // Não deixa a página presa se o Mercado Pago demorar: depois de 15 s responde e a conferência continua sozinha.
    const conferindo = verificarPagamentos(wa).catch(e => { console.error('Mercado Pago:', e.message); return 0 })
    const n = await Promise.race([conferindo, new Promise(r => setTimeout(() => r(null), 15_000))])
    if (n === null) return volta(res, '/pagamentos', { msg: 'O Mercado Pago está demorando. A conferência continua sozinha: atualize a página em alguns instantes.' })
    volta(res, '/pagamentos', { msg: n ? `${n} pagamento(s) confirmado(s).` : 'Nenhum pagamento novo no Mercado Pago.' })
  }))
  app.post('/config/mp-testar', a(async (req, res) => {
    if (String(req.body.mp_token || '').trim()) {
      const t = extrairToken(req.body.mp_token)
      if (!t) return volta(res, '/config/pagamento', { erro: 'Esse não parece um Access Token do Mercado Pago (ele começa com APP_USR-).' })
      setCfg('mp_token', t)
    }
    if (!temMP()) return volta(res, '/config/pagamento', { erro: 'Cole o Access Token do Mercado Pago primeiro.' })
    try {
      const conta = await contaMP()
      volta(res, '/config/pagamento', { msg: `Mercado Pago conectado: conta ${conta}.` })
    } catch (e) {
      volta(res, '/config/pagamento', { erro: `Mercado Pago: ${e.message}` })
    }
  }))

  // Manda de novo o aviso de vitória (fotos + link de pagamento) para um comprador.
  app.post('/vendas/avisar', (req, res) => {
    const jid = String(req.body.comprador || '')
    if (!wa.estado.conectado) return volta(res, '/vendas', { erro: 'O WhatsApp está desconectado.' })
    const { total, pronto } = avisarComprador(wa, jid)
    if (!total) return volta(res, '/vendas', { erro: 'Esse comprador não tem cartas esperando remessa.' })
    pronto.catch(() => {})
    volta(res, '/vendas', { msg: `Enviando o aviso com ${total} carta(s) para ${nomeContato(jid)}.` })
  })

  app.post('/remessas', (req, res) => {
    const b = req.body
    const ids = lista(b.sel).filter(id => db.prepare("SELECT 1 FROM cartas WHERE id = ? AND status = 'vendida' AND remessa_id IS NULL AND remessa_apagada IS NULL AND vencedor = ?").get(id, b.comprador))
    if (!ids.length) return volta(res, '/vendas', { erro: 'Marque pelo menos uma carta.' })
    transacao(() => {
      // Todas as cartas já pagas: a remessa já nasce como "Pago, separar".
      const status = ids.every(cartaPaga) ? 'pago' : 'aguardando_pagamento'
      const rid = db.prepare('INSERT INTO remessas (comprador, nome, telefone, endereco, criada_em, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(b.comprador, b.nome || nomeContato(b.comprador), b.telefone || null, b.endereco || null, Date.now(), status).lastInsertRowid
      for (const id of ids) db.prepare('UPDATE cartas SET remessa_id = ? WHERE id = ?').run(rid, id)
    })
    volta(res, '/remessas', { msg: `Remessa criada com ${ids.length} carta(s). Coloque o código de rastreio quando enviar.` })
  })

  // ---------- Excluir (vendas, pagamentos, remessas, relatórios) ----------
  // Sempre pede a senha de quem está logado e faz um backup do banco antes. Depois, só restaurando o backup.
  const excluir = (fazer) => a(async (req, res) => {
    const voltar = ['/vendas', '/pagamentos', '/remessas', '/relatorios', '/lotes'].find(u => String(req.body.voltar || '').split('?')[0] === u) ? String(req.body.voltar) : '/'
    const ip = ipDe(req)
    if (limitador.bloqueado(ip)) return volta(res, voltar, { erro: 'Muitas senhas erradas. Tente de novo mais tarde.' })
    if (!(await S.senhaValida(req.usuario, req.body.senha))) {
      const travou = limitador.falhou(ip)
      registrarAtividade(req.usuario?.nome, travou ? 'bloqueio' : 'falha', 'Senha errada ao excluir', ip)
      return volta(res, voltar, { erro: 'Senha errada. Nada foi excluído.' })
    }
    const plano = fazer(req.body) // { n, texto, rodar } ou { erro }
    if (plano.erro || !plano.n) return volta(res, voltar, { erro: plano.erro || 'Nada para excluir.' })
    const b = await backupAntesDeApagar()
    if (!b.ok) return volta(res, voltar, { erro: `Nada foi excluído: o backup antes de excluir falhou (${b.msg}).` })
    // O backup pode demorar: a lista é refeita agora, com os dados de agora.
    let feito = null
    transacao(() => {
      feito = fazer(req.body)
      if (!feito.erro && feito.n) feito.rodar()
    })
    if (feito.erro || !feito.n) return volta(res, voltar, { erro: feito.erro || 'Nada para excluir (mudou enquanto o backup era feito).' })
    try { feito.depois?.() } catch (e) { console.error('Depois de excluir:', e.message) }
    volta(res, feito.voltar || voltar, { msg: `${feito.texto}. Para ver de novo, só restaurando o backup ${b.local}${b.drive === 'ok' ? ' (também no Google Drive)' : ''}.` })
  })
  const ids = (v, sql) => lista(v).filter(id => db.prepare(sql).get(id))
  const plural = (n, um, varios) => n === 1 ? um : `${n} ${varios}`

  // Lote: as cartas que não foram vendidas são apagadas (com as fotos). Se o lote tinha vendas, ele só some
  // da lista: as vendas continuam em Vendas, Remessas e Relatórios. Lote com carta na fila ou no ar não pode.
  app.post('/excluir/lotes', excluir(b => {
    const vazios = b.vazios === '1'
    const lst = vazios
      ? db.prepare('SELECT l.id FROM lotes l WHERE l.oculto IS NULL AND NOT EXISTS (SELECT 1 FROM cartas c WHERE c.lote_id = l.id)').all().map(r => r.id)
      : ids(b.sel, 'SELECT 1 FROM lotes WHERE id = ? AND oculto IS NULL')
    const ocupado = lst.find(id => db.prepare("SELECT 1 FROM cartas WHERE lote_id = ? AND status IN ('fila','agendada','no_ar')").get(id))
    if (ocupado) return { erro: `O lote "${nomeLote(ocupado)}" tem cartas na fila, agendadas ou ao vivo. Encerre ou tire da fila antes de excluir.` }
    const fotosApagar = []
    const comVendas = lst.filter(id => db.prepare("SELECT 1 FROM cartas WHERE lote_id = ? AND status = 'vendida'").get(id)).length
    return {
      n: lst.length,
      voltar: '/lotes',
      texto: (lst.length === 1 ? `Lote "${nomeLote(lst[0])}" excluído` : `${lst.length} lotes excluídos`) +
        (comVendas ? '. As vendas continuam em Vendas, Remessas e Relatórios' : ''),
      rodar: () => {
        for (const id of lst) {
          const soltas = db.prepare("SELECT id, foto FROM cartas WHERE lote_id = ? AND status <> 'vendida'").all(id)
          for (const c of soltas) {
            db.prepare('DELETE FROM postagens WHERE carta_id = ?').run(c.id)
            db.prepare('DELETE FROM votos_retirados WHERE carta_id = ?').run(c.id)
            db.prepare('DELETE FROM cartas WHERE id = ?').run(c.id)
          }
          if (db.prepare('SELECT 1 FROM cartas WHERE lote_id = ?').get(id)) db.prepare('UPDATE lotes SET oculto = ? WHERE id = ?').run(Date.now(), id)
          else db.prepare('DELETE FROM lotes WHERE id = ?').run(id)
          fotosApagar.push(...soltas.map(c => c.foto))
        }
      },
      // As fotos saem do disco só depois que o banco confirmou (se der erro no meio, nada some).
      depois: () => fotosApagar.forEach(apagarFoto)
    }
  }))

  // Remessa: some da lista; as cartas continuam nas vendas e relatórios, sem voltar para "Vendidas, sem remessa".
  app.post('/excluir/remessas', excluir(b => {
    const lst = b.entregues === '1'
      ? db.prepare("SELECT id FROM remessas WHERE status = 'entregue'").all().map(r => r.id)
      : ids(b.sel, 'SELECT 1 FROM remessas WHERE id = ?')
    return {
      n: lst.length,
      texto: lst.length === 1 ? `Remessa #${lst[0]} excluída` : `${lst.length} remessas excluídas`,
      rodar: () => {
        for (const id of lst) {
          db.prepare('UPDATE cartas SET remessa_apagada = ?, remessa_id = NULL WHERE remessa_id = ?').run(id, id)
          db.prepare('DELETE FROM remessas WHERE id = ?').run(id)
        }
      }
    }
  }))

  // Cobrança (em aberto ou paga): para os lembretes e some de Pagamentos. As cartas não mudam.
  // Em aberto: é apagada (os lembretes param). Paga: só some do histórico, mas continua valendo como pagamento,
  // para as cartas dela não voltarem a ser cobradas.
  app.post('/excluir/pagamentos', excluir(b => {
    const lst = ids(b.sel, 'SELECT 1 FROM cobrancas WHERE id = ? AND oculta IS NULL')
    return {
      n: lst.length,
      texto: plural(lst.length, 'Cobrança excluída', 'cobranças excluídas'),
      rodar: () => {
        for (const id of lst) {
          const st = db.prepare('SELECT status FROM cobrancas WHERE id = ?').get(id)?.status
          if (st === 'pago') { db.prepare('UPDATE cobrancas SET oculta = 1 WHERE id = ?').run(id); continue }
          db.prepare('DELETE FROM cobranca_cartas WHERE cobranca_id = ?').run(id)
          db.prepare('DELETE FROM cobrancas WHERE id = ?').run(id)
        }
      }
    }
  }))

  // Venda (carta vendida ainda sem remessa): a carta é apagada de vez e sai dos relatórios.
  // Cobranças: a carta sai delas. Cobrança paga continua paga (as outras cartas dela seguem pagas).
  // Cobrança em aberto que tinha outras cartas é cancelada (o link tinha o valor antigo): mande o aviso de novo
  // para gerar uma com o valor certo. Se ficou vazia, é apagada.
  app.post('/excluir/vendas', excluir(b => {
    const lst = ids(b.sel, "SELECT 1 FROM cartas WHERE id = ? AND status = 'vendida' AND remessa_id IS NULL")
    const cobs = [...new Set(lst.flatMap(id => db.prepare('SELECT cobranca_id FROM cobranca_cartas WHERE carta_id = ?').all(id).map(r => r.cobranca_id)))]
      .map(id => db.prepare('SELECT id, status FROM cobrancas WHERE id = ?').get(id)).filter(Boolean)
    const marcadas = new Set(lst)
    const canceladas = cobs.filter(c => c.status === 'pendente' && db.prepare('SELECT carta_id FROM cobranca_cartas WHERE cobranca_id = ?').all(c.id).some(r => !marcadas.has(r.carta_id)))
    return {
      n: lst.length,
      texto: plural(lst.length, 'Venda excluída', 'vendas excluídas') +
        (canceladas.length ? `. ${plural(canceladas.length, 'Uma cobrança em aberto', 'cobranças em aberto')} com outras cartas foi cancelada: use "Mandar aviso de novo" para gerar o link com o valor certo` : ''),
      rodar: () => {
        for (const id of lst) {
          db.prepare('DELETE FROM cobranca_cartas WHERE carta_id = ?').run(id)
          db.prepare('DELETE FROM votos WHERE carta_id = ?').run(id)
          db.prepare('DELETE FROM votos_retirados WHERE carta_id = ?').run(id)
          db.prepare('DELETE FROM cartas WHERE id = ?').run(id)
        }
        for (const c of cobs) {
          const resta = db.prepare('SELECT COUNT(*) n FROM cobranca_cartas WHERE cobranca_id = ?').get(c.id).n
          if (c.status === 'pago') { if (!resta) db.prepare('UPDATE cobrancas SET oculta = 1 WHERE id = ?').run(c.id); continue }
          if (!resta) { db.prepare('DELETE FROM cobrancas WHERE id = ?').run(c.id); continue }
          if (c.status === 'pendente') db.prepare("UPDATE cobrancas SET status = 'cancelada', pago_por = 'venda excluída' WHERE id = ?").run(c.id)
        }
      }
    }
  }))

  // Relatórios: tira do relatório as cartas encerradas no período. Vendas, pagamentos e remessas não mudam.
  app.post('/excluir/relatorio', excluir(b => {
    const chave = PERIODOS[b.periodo] ? b.periodo : '30'
    const desde = inicioDoPeriodo(chave)
    const n = db.prepare("SELECT COUNT(*) n FROM cartas WHERE status IN ('vendida','sem_lance') AND encerrada_em >= ? AND fora_relatorio IS NULL").get(desde).n
    return {
      n,
      texto: `${plural(n, 'Uma carta saiu', `cartas saíram`)} dos relatórios (${PERIODOS[chave].nome})`,
      rodar: () => db.prepare("UPDATE cartas SET fora_relatorio = ? WHERE status IN ('vendida','sem_lance') AND encerrada_em >= ? AND fora_relatorio IS NULL").run(Date.now(), desde)
    }
  }))

  app.post('/remessas/:id', a(async (req, res) => {
    const b = req.body
    const id = Number(req.params.id)
    const antes = db.prepare('SELECT * FROM remessas WHERE id = ?').get(id)
    if (!antes) return volta(res, '/remessas', { erro: 'Remessa não encontrada.' })
    const status = P.STATUS_REMESSA[b.status] ? b.status : 'aguardando_pagamento'
    const transp = TRANSPORTADORAS[b.transportadora] !== undefined ? b.transportadora : (antes.transportadora || '')
    db.prepare('UPDATE remessas SET status = ?, rastreio = ?, transportadora = ?, telefone = ?, endereco = ?, obs = ? WHERE id = ?')
      .run(status, codigoLimpo(b.rastreio) || null, transp || null, b.telefone || null, b.endereco || null, b.obs || null, id)
    // Marcou como paga à mão: as cobranças dessas cartas param de mandar lembrete.
    if (antes.status === 'aguardando_pagamento' && status === 'pago') {
      const n = pagarPelaRemessa(id, req.usuario?.nome || 'painel')
      if (n) registrarAtividade(req.usuario?.nome, 'acao', `Remessa #${id} marcada como paga (${plural(n, 'cobrança encerrada', 'cobranças encerradas')})`)
    }
    const r = await codigoSalvo(wa, id, antes.rastreio)
    volta(res, '/remessas', r.erro
      ? { msg: `Remessa #${id} salva.`, erro: `Não consegui mandar o código ao comprador: ${r.erro}` }
      : { msg: r.avisou ? `Remessa #${id} salva e código de rastreio mandado ao comprador.` : `Remessa #${id} salva.` })
  }))

  app.post('/remessas/:id/codigo', a(async (req, res) => {
    try {
      await mandarCodigo(wa, Number(req.params.id))
      volta(res, '/remessas', { msg: 'Código de rastreio mandado ao comprador.' })
    } catch (e) {
      volta(res, '/remessas', { erro: `Não consegui mandar o código: ${e.message}` })
    }
  }))

  app.post('/remessas/:id/rastreio', a(async (req, res) => {
    try {
      const r = await conferir(wa, Number(req.params.id))
      volta(res, '/remessas', { msg: r.novas ? `${r.novas} movimentação(ões) nova(s): ${MARCOS[r.marco] || r.marco}${r.avisou ? '. O comprador foi avisado.' : '.'}` : 'Nenhuma movimentação nova.' })
    } catch (e) {
      volta(res, '/remessas', { erro: `Rastreio: ${e.message}` })
    }
  }))

  app.post('/remessas/:id/desfazer', (req, res) => {
    const id = Number(req.params.id)
    transacao(() => {
      db.prepare('UPDATE cartas SET remessa_id = NULL WHERE remessa_id = ?').run(id)
      db.prepare('DELETE FROM remessas WHERE id = ?').run(id)
    })
    volta(res, '/remessas', { msg: `Remessa #${id} desfeita.` })
  })

  // ---------- Divulgação ----------
  const comDestino = lista => lista.map(d => ({ ...d, destinoTxt: descreverDestino(d) }))

  app.get('/divulgacao', (req, res) => {
    pagina(req, res, 'Divulgação', P.paginaDivulgacao({
      grupos: listarGruposDoBot(),
      agendadas: comDestino(divulgacoesAgendadas()),
      enviadas: comDestino(divulgacoesEnviadas()),
      c: todasCfg()
    }), '/divulgacao')
  })

  app.post('/divulgacao', upload.single('foto'), (req, res) => {
    const b = req.body
    const foto = req.file?.filename || null
    const desfazer = erro => { if (foto) fs.rm(path.join(PASTA_FOTOS, foto), { force: true }, () => {}); volta(res, '/divulgacao', { erro }) }
    const texto = String(b.texto || '').trim()
    if (!texto && !foto) return desfazer('Escreva a mensagem ou escolha uma foto.')
    const { destino, erro } = lerDestino(b.destino)
    if (erro) return desfazer(erro)
    const agora = Date.now()
    const { enviarEm } = P.lerHorarios(b, agora)
    if (b.enviar_modo === 'data' && !enviarEm) return desfazer('Não entendi o dia e a hora. Use por exemplo 25/10 e 19:30.')
    const quando = enviarEm && enviarEm > agora ? enviarEm : agora
    criarDivulgacao({ texto, foto, destino, quando, repetir: String(b.repetir || ''), autor: req.usuario?.nome }, agora)
    if (quando <= agora) enviarDivulgacoes().catch(e => console.error('Erro na divulgação:', e))
    volta(res, '/divulgacao', { msg: quando <= agora ? 'Divulgação sendo enviada.' : `Divulgação agendada para ${P.dataHora(quando)}.` })
  })

  app.post('/divulgacao/:id/enviar', (req, res) => {
    const d = pegarDivulgacao(req.params.id)
    if (!d) return volta(res, '/divulgacao', { erro: 'Divulgação não encontrada.' })
    if (!wa.estado.conectado) return volta(res, '/divulgacao', { erro: 'O WhatsApp está desconectado.' })
    enviarDivulgacaoAgora(d.id).catch(e => console.error('Erro na divulgação:', e))
    volta(res, '/divulgacao', { msg: 'Enviando agora.' })
  })

  app.post('/divulgacao/:id/apagar', (req, res) => {
    const { apagou, foto } = apagarDivulgacao(req.params.id)
    if (foto) fs.rm(path.join(PASTA_FOTOS, foto), { force: true }, () => {})
    volta(res, '/divulgacao', apagou ? { msg: 'Divulgação apagada.' } : { erro: 'Divulgação não encontrada.' })
  })

  app.post('/divulgacao/link', (req, res) => {
    const b = req.body
    const num = (v, min, max, pad) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad }
    setCfg('link_ativo', b.link_ativo === '1' ? '1' : '0')
    setCfg('link_url', String(b.link_url || '').trim())
    setCfg('link_texto', String(b.link_texto || '').trim())
    setCfg('link_hora_inicio', num(b.link_hora_inicio, 0, 23, 8))
    setCfg('link_hora_fim', num(b.link_hora_fim, 1, 24, 22))
    const erro = b.link_ativo === '1' && !/^https?:\/\//i.test(String(b.link_url || '')) ? 'O link da loja precisa começar com http:// ou https://' : ''
    volta(res, '/links', { msg: 'Link da loja salvo.', erro })
  })

  // ---------- Strikes e bloqueios ----------
  const nomeCarta = id => { const c = db.prepare('SELECT c.numero, c.id, l.nome FROM cartas c JOIN lotes l ON l.id = c.lote_id WHERE c.id = ?').get(id); return c ? `${c.nome} #${c.numero ?? c.id}` : '' }
  app.get('/punicoes', (req, res) => {
    pagina(req, res, 'Strikes e bloqueios', P.paginaPunicoes({ ...listarPunicoes(), c: todasCfg(), nome: nomeContato, carta: nomeCarta }), '/punicoes')
  })
  const votanteDe = b => String(b.votante || '').trim()
  app.post('/punicoes/desbloquear', (req, res) => { const v = votanteDe(req.body); desbloquear(v); volta(res, '/punicoes', { msg: `${nomeContato(v)} desbloqueado. Os votos voltam a valer.` }) })
  app.post('/punicoes/zerar', (req, res) => { const v = votanteDe(req.body); zerarStrikes(v); volta(res, '/punicoes', { msg: `Strikes de ${nomeContato(v)} zerados.` }) })
  app.post('/punicoes/tirar', (req, res) => { const v = votanteDe(req.body); tirarUmStrike(v); volta(res, '/punicoes', { msg: `Tirei 1 strike de ${nomeContato(v)}.` }) })
  app.post('/punicoes/bloquear', (req, res) => {
    let v = votanteDe(req.body)
    if (!v) {
      let num = String(req.body.telefone || '').replace(/\D/g, '')
      if (num.length === 10 || num.length === 11) num = '55' + num
      if (num.length < 12) return volta(res, '/punicoes', { erro: 'Digite o número com DDD.' })
      v = `${num}@s.whatsapp.net`
    }
    bloquear(v, 'bloqueado pelo painel', req.usuario?.nome || '')
    volta(res, '/punicoes', { msg: `${nomeContato(v)} bloqueado.` })
  })

  // ---------- Verificação de membros ----------
  app.get('/seguranca', (req, res) => {
    pagina(req, res, 'Verificação de membros', P.paginaSeguranca({ ...listarRiscos(), nomeGrupo: j => grupoDoBot(j)?.nome || 'grupo' }), '/seguranca')
  })
  app.post('/seguranca/verificar', a(async (req, res) => {
    if (!wa.estado.conectado) return volta(res, '/seguranca', { erro: 'O WhatsApp está desconectado.' })
    const grupos = listarGruposDoBot()
    if (!grupos.length) return volta(res, '/seguranca', { erro: 'Nenhum grupo no leilão para verificar.' })
    const r = await verificarMembros(wa, grupos)
    volta(res, '/seguranca', { msg: `${r.membros} membro(s) verificados: ${r.alto} de alto risco e ${r.atencao} para atenção.`, erro: r.falhas.join('; ') })
  }))
  const jidDe = b => String(b.jid || '').trim()
  app.post('/seguranca/confiavel', (req, res) => { marcarConfiavel(jidDe(req.body), req.usuario?.nome); volta(res, '/seguranca', { msg: `${nomeContato(jidDe(req.body))} marcado como confiável.` }) })
  app.post('/seguranca/tirar-confiavel', (req, res) => { tirarConfiavel(jidDe(req.body)); volta(res, '/seguranca', { msg: 'Tirado da lista de confiáveis.' }) })
  app.post('/seguranca/bloquear', (req, res) => { bloquear(jidDe(req.body), 'bloqueado na verificação de membros', req.usuario?.nome || ''); volta(res, '/seguranca', { msg: `${nomeContato(jidDe(req.body))} bloqueado: os votos não valem mais.` }) })
  app.post('/seguranca/remover', a(async (req, res) => {
    const grupo = String(req.body.grupo || ''); const idWa = String(req.body.id_wa || ''); const jid = jidDe(req.body)
    if (!grupoDoBot(grupo) || !idWa) return volta(res, '/seguranca', { erro: 'Grupo ou membro inválido.' })
    try {
      await wa.removerDoGrupo(grupo, idWa)
    } catch (e) {
      return volta(res, '/seguranca', { erro: `Não consegui remover: ${e.message}` })
    }
    removerMembro(grupo, jid)
    volta(res, '/seguranca', { msg: `${nomeContato(jid)} removido de ${grupoDoBot(grupo)?.nome || 'grupo'}.` })
  }))

  // ---------- Gerenciador de links ----------
  app.get('/links', (req, res) => {
    pagina(req, res, 'Links', P.paginaLinks({ c: todasCfg(), autorizados: listarAutorizados(), apagados: ultimosApagados(), nome: nomeContato, nomeGrupo: j => grupoDoBot(j)?.nome || 'grupo' }), '/links')
  })
  app.post('/links', (req, res) => {
    const b = req.body
    setCfg('links_ativo', b.links_ativo === '1' ? '1' : '0')
    setCfg('links_aviso', String(b.links_aviso || '').trim())
    setCfg('links_dominios', String(b.links_dominios || '').split(/[\s,;]+/).map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean).join(', '))
    volta(res, '/links', { msg: b.links_ativo === '1' ? 'Bloqueio de links ligado.' : 'Bloqueio de links desligado.' })
  })
  app.post('/links/pagamento', (req, res) => {
    const link = extrairLink(req.body.ganhador_link)
    if (link === null) return volta(res, '/links', { erro: 'O link de pagamento não foi entendido. Cole só o endereço, ex.: https://mpago.la/abc123' })
    setCfg('ganhador_link', link)
    volta(res, '/links', { msg: link ? 'Link de pagamento salvo.' : 'Link de pagamento apagado.' })
  })
  app.post('/links/autorizar', (req, res) => {
    let num = String(req.body.telefone || '').replace(/\D/g, '')
    if (num.length === 10 || num.length === 11) num = '55' + num
    if (num.length < 12) return volta(res, '/links', { erro: 'Digite o número com DDD.' })
    autorizar(num, String(req.body.nome || '').trim(), req.usuario?.nome)
    volta(res, '/links', { msg: `+${num} pode mandar links.` })
  })
  app.post('/links/desautorizar', (req, res) => {
    desautorizar(String(req.body.chave || ''))
    volta(res, '/links', { msg: 'Autorização retirada.' })
  })

  // ---------- Configurações ----------
  const cfgTela = () => ({ ...todasCfg(), ganhador_msg: cfg('ganhador_msg') || MENSAGEM_PADRAO, cobranca_msg: cfg('cobranca_msg') || LEMBRETE_PADRAO,
    cobranca_msg_pago: cfg('cobranca_msg_pago') || PAGO_PADRAO, rastreio_msg: cfg('rastreio_msg') || MSG_CODIGO, rastreio_msg_mov: cfg('rastreio_msg_mov') || MSG_MOVIMENTO,
    mp_token: '', mp_ok: temMP() })
  app.get('/config', (req, res) => pagina(req, res, 'Configurações', P.paginaConfigLista(cfgTela()), '/config'))
  app.get('/config/:secao', (req, res, next) => {
    const sec = P.SECOES_CONFIG.find(x => x[0] === req.params.secao)
    if (!sec) return next()
    pagina(req, res, sec[2], P.paginaConfigSecao(sec[0], cfgTela()), '/config', { voltar: ['/config', 'Configurações'] })
  })

  // Cada seção de Configurações salva só os próprios campos.
  const num = (v, min, max, pad) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad }
  const marcado = (b, k) => setCfg(k, b[k] === '1' ? '1' : '0')
  const texto = (b, k, padrao) => { if (b[k] === undefined) return; const m = String(b[k] || '').replace(/\r/g, '').trim(); setCfg(k, padrao && m === padrao.trim() ? '' : m.slice(0, 2000)) }
  app.post('/config/:secao', (req, res, next) => {
    const b = req.body
    const sec = req.params.secao
    const problemas = []
    switch (sec) {
      case 'envio': {
        marcado(b, 'fila_pausada')
        const imin = num(b.intervalo_min, 3, 600, 8)
        setCfg('intervalo_min', imin)
        setCfg('intervalo_max', Math.max(imin, num(b.intervalo_max, 3, 600, 15)))
        texto(b, 'previa_texto')
        break
      }
      case 'ganhador':
        for (const k of ['anunciar_resultado', 'apagar_enquete', 'apagar_foto', 'ganhador_ativo']) marcado(b, k)
        if (b.ganhador_fotos !== undefined) setCfg('ganhador_fotos', b.ganhador_fotos === 'separadas' ? 'separadas' : 'mural')
        texto(b, 'ganhador_msg', MENSAGEM_PADRAO)
        break
      case 'pagamento':
        marcado(b, 'cobranca_ativo'); marcado(b, 'cobranca_avisar_pago')
        if (b.mp_remover === '1') setCfg('mp_token', '')
        else if (String(b.mp_token || '').trim()) {
          const t = extrairToken(b.mp_token)
          if (t) setCfg('mp_token', t); else problemas.push('o Access Token do Mercado Pago não foi entendido (ele começa com APP_USR-)')
        }
        {
          // Horas de 1 em 1 e minutos de 5 em 5.
          const hora = (h, m) => {
            const hh = Number(h); const mm = Number(m ?? 0)
            if (!Number.isInteger(hh) || hh < 0 || hh > 23 || !Number.isInteger(mm) || mm < 0 || mm > 55 || mm % 5) return null
            return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
          }
          const hs = [...new Set([hora(b.cobranca_h1, b.cobranca_m1), hora(b.cobranca_h2, b.cobranca_m2)].filter(Boolean))].sort()
          setCfg('cobranca_horas', (hs.length ? hs : ['10:00', '19:00']).join(','))
        }
        texto(b, 'cobranca_msg', LEMBRETE_PADRAO); texto(b, 'cobranca_msg_pago', PAGO_PADRAO)
        if (b.endereco_publico !== undefined) {
          const e = String(b.endereco_publico || '').trim().replace(/\/+$/, '').toLowerCase()
          if (!e) setCfg('endereco_publico', '')
          else if (/^https:\/\/[a-z0-9.-]+$/.test(e)) setCfg('endereco_publico', e)
          else problemas.push('o endereço do painel precisa ser algo como https://painel.seudominio.com.br')
        }
        break
      case 'rastreio': {
        marcado(b, 'rastreio_ativo')
        if (b.rastreio_remover === '1') setCfg('rastreio_chave', '')
        else if (String(b.rastreio_chave_nova || '').trim()) {
          const k = String(b.rastreio_chave_nova).trim()
          if (/^[A-Za-z0-9_-]{20,}$/.test(k)) setCfg('rastreio_chave', k); else problemas.push('a chave do PacoteVício não foi entendida (copie a X-RapidAPI-Key inteira)')
        }
        setCfg('rastreio_horas', [2, 4, 6, 8, 12, 24].includes(Number(b.rastreio_horas)) ? Number(b.rastreio_horas) : 6)
        setCfg('rastreio_avisar', ['marcos', 'tudo', 'nada'].includes(b.rastreio_avisar) ? b.rastreio_avisar : 'marcos')
        const link = extrairLink(b.rastreio_link)
        if (link === null) problemas.push('o link de acompanhamento não foi entendido')
        else setCfg('rastreio_link', link || 'https://www.linkcorreios.com.br/?id={codigo}')
        texto(b, 'rastreio_msg', MSG_CODIGO); texto(b, 'rastreio_msg_mov', MSG_MOVIMENTO)
        break
      }
      case 'strikes':
        marcado(b, 'strikes_ativo')
        setCfg('strikes_minutos', num(b.strikes_minutos, 1, 60, 2))
        setCfg('strikes_limite', num(b.strikes_limite, 1, 50, 3))
        break
      default: return next()
    }
    const destino = `/config/${sec}`
    if (problemas.length) return volta(res, destino, { erro: `O resto foi salvo, mas ${problemas.join(' e ')}.` })
    volta(res, destino, { msg: 'Salvo.' })
  })

  app.post('/config', (req, res) => {
    const b = req.body
    setCfg('previa_texto', String(b.previa_texto || '').trim())
    for (const k of ['fila_pausada', 'anunciar_resultado', 'apagar_enquete', 'apagar_foto', 'strikes_ativo', 'ganhador_ativo', 'cobranca_ativo', 'cobranca_avisar_pago']) setCfg(k, b[k] === '1' ? '1' : '0')
    const num = (v, min, max, pad) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : pad }
    const problemas = []
    if (b.ganhador_link !== undefined) {
      const link = extrairLink(b.ganhador_link)
      if (link === null) problemas.push('o link de pagamento não foi entendido (cole só o endereço, ex.: https://mpago.la/abc123)')
      else setCfg('ganhador_link', link)
    }
    if (b.ganhador_msg !== undefined) {
      const m = String(b.ganhador_msg || '').replace(/\r/g, '').trim()
      setCfg('ganhador_msg', m === MENSAGEM_PADRAO.trim() ? '' : m.slice(0, 2000))
    }
    if (b.mp_remover === '1') setCfg('mp_token', '')
    else if (String(b.mp_token || '').trim()) {
      const t = extrairToken(b.mp_token)
      if (!t) problemas.push('o Access Token do Mercado Pago não foi entendido (ele começa com APP_USR-)')
      else setCfg('mp_token', t)
    }
    if (b.cobranca_h1 !== undefined) {
      const hs = [b.cobranca_h1, b.cobranca_h2].map(Number).filter(h => Number.isInteger(h) && h >= 0 && h <= 23)
      const unicas = [...new Set(hs)].sort((x, y) => x - y)
      setCfg('cobranca_horas', (unicas.length ? unicas : [10, 19]).map(h => String(h).padStart(2, '0') + ':00').join(','))
    }
    for (const [campo, padrao] of [['cobranca_msg', LEMBRETE_PADRAO], ['cobranca_msg_pago', PAGO_PADRAO]]) {
      if (b[campo] === undefined) continue
      const m = String(b[campo] || '').replace(/\r/g, '').trim()
      setCfg(campo, m === padrao.trim() ? '' : m.slice(0, 2000))
    }
    setCfg('strikes_minutos', num(b.strikes_minutos, 1, 60, 2))
    setCfg('strikes_limite', num(b.strikes_limite, 1, 50, 3))
    const imin = num(b.intervalo_min, 3, 600, 8)
    setCfg('intervalo_min', imin)
    setCfg('intervalo_max', Math.max(imin, num(b.intervalo_max, 3, 600, 15)))
    if (problemas.length) return volta(res, '/config', { erro: `O resto foi salvo, mas ${problemas.join(' e ')}.` })
    volta(res, '/config', { msg: 'Configurações salvas.' })
  })

  // Erros (inclusive foto grande demais).
  app.use((err, req, res, next) => {
    console.error(err)
    const erro = err.code === 'LIMIT_FILE_SIZE' ? 'Foto grande demais (máximo 15 MB).' : `Erro: ${err.message}`
    let para = '/'
    try { para = voltaSegura(new URL(req.get('referer') || '/', 'http://x').pathname) } catch {}
    if (res.headersSent) return
    // Não volta para a página que acabou de dar erro (evita ficar num ciclo de redirecionamentos).
    if (para === req.path) return res.status(500).type('text').send(`${erro}\n\nVolte para o início do painel: /`)
    volta(res, para, { erro })
  })

  const porta = Number(process.env.PORTA) || 3000
  app.listen(porta, '0.0.0.0', () => console.log(`🖥️  Painel no ar: http://IP-DA-VM:${porta}`))
  return app
}
