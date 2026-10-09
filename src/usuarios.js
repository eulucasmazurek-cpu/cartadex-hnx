// Usuários do painel, proteção contra tentativas de senha e registro de atividade.
import crypto from 'node:crypto'

const SENHA_PADRAO = 'troque-esta-senha'

// Lê os usuários do .env. Cada linha SENHA_NOME=senha cria o usuário "nome".
// Ex.: SENHA_LUCAS=..., SENHA_VITOR=..., SENHA_BIA=...
// Sem nenhuma linha assim, vale o login antigo (PAINEL_USUARIO / PAINEL_SENHA).
export function lerUsuarios (env = process.env) {
  const lista = []
  for (const [chave, senha] of Object.entries(env)) {
    const m = /^SENHA_([A-Za-z0-9_.-]+)$/.exec(chave)
    if (!m) continue
    const login = m[1].toLowerCase()
    lista.push({ login, nome: login.charAt(0).toUpperCase() + login.slice(1), senha: String(senha ?? '') })
  }
  if (!lista.length && env.PAINEL_SENHA !== undefined) {
    const login = String(env.PAINEL_USUARIO || 'admin').toLowerCase()
    lista.push({ login, nome: login.charAt(0).toUpperCase() + login.slice(1), senha: String(env.PAINEL_SENHA) })
  }
  return lista.sort((a, b) => a.login.localeCompare(b.login))
}

// Devolve a lista de problemas (vazia = tudo certo).
export function problemasUsuarios (lista) {
  const p = []
  if (!lista.length) p.push('nenhum usuário definido (crie linhas SENHA_NOME=senha no .env)')
  const senhas = new Set()
  for (const u of lista) {
    if (!u.senha || u.senha === SENHA_PADRAO || u.senha.length < 8) p.push(`a senha de ${u.nome} precisa ter pelo menos 8 caracteres`)
    else if (senhas.has(u.senha)) p.push(`a senha de ${u.nome} é igual à de outro usuário; use senhas diferentes`)
    senhas.add(u.senha)
  }
  return p
}

function igual (x, y) {
  const hx = crypto.createHash('sha256').update(String(x)).digest()
  const hy = crypto.createHash('sha256').update(String(y)).digest()
  return crypto.timingSafeEqual(hx, hy)
}

// Confere usuário e senha. Devolve o usuário ou null. O nome não diferencia maiúsculas.
export function conferirLogin (lista, usuario, senha) {
  const login = String(usuario || '').trim().toLowerCase()
  let achado = null
  for (const u of lista) {
    // Compara com todos para o tempo de resposta não revelar quais nomes existem.
    if (igual(u.login, login) & igual(u.senha, senha)) achado = u
  }
  return achado
}

// Confere a senha de quem já está logado (para ações de excluir).
export function senhaConfere (usuario, senha) {
  return Boolean(usuario && senha) && igual(usuario.senha, String(senha))
}

// Bloqueia um endereço depois de muitas senhas erradas seguidas.
export function criarLimitador ({ max = 8, janelaMs = 15 * 60_000, bloqueioMs = 30 * 60_000 } = {}) {
  const mapa = new Map()
  const limpar = agora => {
    for (const [ip, r] of mapa) if (r.ate < agora && r.ultimo + janelaMs < agora) mapa.delete(ip)
  }
  return {
    bloqueado (ip, agora = Date.now()) {
      const r = mapa.get(ip)
      return r && r.ate > agora ? Math.ceil((r.ate - agora) / 60_000) : 0
    },
    falhou (ip, agora = Date.now()) {
      if (mapa.size > 5000) limpar(agora)
      let r = mapa.get(ip)
      if (!r || r.ultimo + janelaMs < agora) r = { n: 0, ate: 0, ultimo: agora }
      r.n++
      r.ultimo = agora
      if (r.n >= max) { r.ate = agora + bloqueioMs; r.n = 0 }
      mapa.set(ip, r)
      return r.ate > agora
    },
    acertou (ip) { mapa.delete(ip) }
  }
}

// Endereço de quem acessa. Atrás do ngrok/Cloudflare (conexão vinda do próprio aparelho),
// usa o último endereço do X-Forwarded-For, que é o que o túnel acrescentou.
export function ipDe (req) {
  const direto = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
  const local = direto === '127.0.0.1' || direto === '::1'
  const xff = String(req.headers?.['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean)
  return local && xff.length ? xff.at(-1) : direto || '?'
}

// Texto amigável para cada ação feita no painel.
const ACOES = [
  [/^\/fila\/pausar$/, 'Pausou a fila de envio'],
  [/^\/fila\/retomar$/, 'Retomou a fila de envio'],
  [/^\/conexao\/grupo$/, 'Adicionou grupo ao leilão'],
  [/^\/conexao\/grupo\/pausar$/, 'Pausou um grupo'],
  [/^\/conexao\/grupo\/retomar$/, 'Retomou um grupo'],
  [/^\/conexao\/grupo\/remover$/, 'Removeu um grupo do leilão'],
  [/^\/conexao\/grupo\/sair$/, 'Fez o bot sair de um grupo'],
  [/^\/conexao\/grupo\/fechar$/, 'Fechou um grupo (só administradores)'],
  [/^\/conexao\/grupo\/abrir$/, 'Abriu um grupo para todos'],
  [/^\/conexao\/fechar-todos$/, 'Fechou todos os grupos'],
  [/^\/conexao\/abrir-todos$/, 'Abriu todos os grupos'],
  [/^\/conexao\/horario$/, 'Mudou o horário de fechar e abrir'],
  [/^\/divulgacao$/, 'Criou uma divulgação'],
  [/^\/divulgacao\/(\d+)\/enviar$/, 'Enviou uma divulgação'],
  [/^\/divulgacao\/(\d+)\/apagar$/, 'Apagou uma divulgação'],
  [/^\/divulgacao\/link$/, 'Mudou o link da loja'],
  [/^\/lotes$/, 'Criou um lote'],
  [/^\/lotes\/(\d+)\/fotos$/, 'Adicionou fotos ao lote'],
  [/^\/lotes\/(\d+)\/salvar$/, 'Editou cartas do lote'],
  [/^\/lotes\/(\d+)\/enviar$/, 'Enviou cartas do lote'],
  [/^\/lotes\/(\d+)\/aplicar$/, 'Editou várias cartas do lote'],
  [/^\/lotes\/(\d+)\/previa$/, 'Enviou a prévia do lote'],
  [/^\/lotes\/(\d+)\/cancelar$/, 'Cancelou envios do lote'],
  [/^\/lotes\/(\d+)\/encerrar$/, 'Encerrou cartas do lote'],
  [/^\/lotes\/(\d+)\/excluir-cartas$/, 'Excluiu cartas do lote'],
  [/^\/lotes\/(\d+)\/renomear$/, 'Renomeou o lote'],
  [/^\/lotes\/(\d+)\/excluir$/, 'Excluiu o lote'],
  [/^\/no-ar\/encerrar$/, 'Encerrou cartas ao vivo'],
  [/^\/sem-lance\/salvar$/, 'Editou cartas sem lance'],
  [/^\/sem-lance\/reenviar$/, 'Reenviou cartas sem lance'],
  [/^\/vendas\/avisar$/, 'Mandou de novo o aviso para o ganhador'],
  [/^\/cobrancas\/(\d+)\/pago$/, 'Marcou uma cobrança como paga'],
  [/^\/cobrancas\/(\d+)\/cancelar$/, 'Parou uma cobrança'],
  [/^\/cobrancas\/(\d+)\/lembrar$/, 'Mandou um lembrete de pagamento'],
  [/^\/cobrancas\/verificar$/, 'Conferiu os pagamentos'],
  [/^\/config\/mp-testar$/, 'Testou o Mercado Pago'],
  [/^\/remessas$/, 'Criou remessas'],
  [/^\/remessas\/(\d+)$/, 'Atualizou uma remessa'],
  [/^\/remessas\/(\d+)\/desfazer$/, 'Desfez uma remessa'],
  [/^\/usuarios\/whats$/, 'Mudou o WhatsApp da equipe'],
  [/^\/usuarios\/senha$/, 'Trocou a própria senha'],
  [/^\/usuarios\/sair-outros$/, 'Desconectou os outros aparelhos'],
  [/^\/excluir\/remessas$/, 'Excluiu remessas (com senha e backup)'],
  [/^\/excluir\/vendas$/, 'Excluiu vendas (com senha e backup)'],
  [/^\/excluir\/pagamentos$/, 'Excluiu cobranças (com senha e backup)'],
  [/^\/excluir\/relatorio$/, 'Excluiu dados dos relatórios (com senha e backup)'],
  [/^\/atividade\/limpar$/, 'Limpou a atividade'],
  [/^\/backup\/agora$/, 'Fez um backup manual'],
  [/^\/backup$/, 'Alterou o backup'],
  [/^\/punicoes\/desbloquear$/, 'Desbloqueou uma pessoa'],
  [/^\/punicoes\/zerar$/, 'Zerou os strikes de uma pessoa'],
  [/^\/punicoes\/tirar$/, 'Tirou 1 strike de uma pessoa'],
  [/^\/punicoes\/bloquear$/, 'Bloqueou uma pessoa'],
  [/^\/seguranca\/verificar$/, 'Verificou os membros dos grupos'],
  [/^\/seguranca\/confiavel$/, 'Marcou um membro como confiável'],
  [/^\/seguranca\/tirar-confiavel$/, 'Tirou um membro dos confiáveis'],
  [/^\/seguranca\/bloquear$/, 'Bloqueou um membro suspeito'],
  [/^\/seguranca\/remover$/, 'Removeu um membro do grupo'],
  [/^\/links$/, 'Mudou o bloqueio de links'],
  [/^\/links\/autorizar$/, 'Autorizou um número a mandar links'],
  [/^\/links\/desautorizar$/, 'Tirou a autorização de links'],
  [/^\/config$/, 'Alterou as configurações'],
  [/^\/config\/envio$/, 'Alterou o envio das cartas'],
  [/^\/config\/ganhador$/, 'Alterou o encerramento e o aviso ao ganhador'],
  [/^\/config\/pagamento$/, 'Alterou pagamento e cobrança'],
  [/^\/config\/rastreio$/, 'Alterou o rastreio'],
  [/^\/config\/strikes$/, 'Alterou as regras de strike'],
  [/^\/links\/pagamento$/, 'Mudou o link de pagamento'],
  [/^\/remessas\/(\d+)\/codigo$/, 'Mandou o código de rastreio'],
  [/^\/remessas\/(\d+)\/rastreio$/, 'Conferiu o rastreio']
]

export function descreverAcao (caminho) {
  for (const [re, texto] of ACOES) {
    const m = re.exec(caminho)
    if (m) return { texto, loteId: /^\/lotes\/\d+/.test(caminho) ? Number(m[1]) : null }
  }
  return { texto: caminho, loteId: null }
}
