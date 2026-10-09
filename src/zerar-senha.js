// Emergência: volta a valer a senha do .env de um usuário (apaga a senha criada no painel e desconecta os aparelhos dele).
//   cartadex zerar-senha lucas
const login = String(process.argv[2] || '').trim().toLowerCase()
if (!login) { console.log('Uso: cartadex zerar-senha <usuário>'); process.exit(1) }
const { zerarSenha } = await import('./sessao.js')
const tinha = zerarSenha(login)
console.log(tinha
  ? `✅ Pronto: ${login} volta a entrar com a senha do .env (linha SENHA_${login.toUpperCase()}).`
  : `ℹ️ ${login} não tinha senha criada no painel; já vale a do .env (linha SENHA_${login.toUpperCase()}). Os aparelhos dele foram desconectados.`)
process.exit(0)
