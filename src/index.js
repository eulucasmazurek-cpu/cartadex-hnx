// Ponto de partida: liga o WhatsApp, a fila de envio e o painel.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo'
// Logo no começo, para um erro solto durante a inicialização não derrubar o bot.
process.on('unhandledRejection', e => console.error('Erro solto (o bot continua):', e?.stack || e?.message || e))

// A biblioteca de criptografia do WhatsApp imprime as sessões inteiras no log, com as chaves privadas.
// Isso não serve para nada e não pode ficar gravado: essas mensagens são descartadas.
const RUIDO = /^(Closing session|Closing open session|Closing stale open session|Removing old closed session|Session already closed|Session already open|Migrating session|Decrypted message with closed session)/
const temChave = v => v != null && typeof v === 'object' && !(v instanceof Error) &&
  ['indexInfo', 'currentRatchet', '_chains', 'ephemeralKeyPair', 'rootKey', 'privKey', '_sessions', 'pendingPreKey'].some(k => k in v)
for (const nivel of ['log', 'info', 'warn', 'debug', 'error']) {
  const original = console[nivel].bind(console)
  console[nivel] = (...args) => {
    if (nivel !== 'error' && typeof args[0] === 'string' && RUIDO.test(args[0])) return
    if (args.some(temChave)) return
    original(...args)
  }
}

const { lerUsuarios, problemasUsuarios } = await import('./usuarios.js')
const usuarios = lerUsuarios()
const problemas = problemasUsuarios(usuarios)
if (problemas.length) {
  console.error('❌ Ajuste os logins do painel no arquivo .env antes de ligar o bot:')
  for (const p of problemas) console.error('   - ' + p)
  console.error('   Exemplo:  SENHA_LUCAS=uma-senha-forte')
  process.exit(1)
}
console.log(`👥 Usuários do painel: ${usuarios.map(u => u.nome).join(', ')}`)

const wa = await import('./whatsapp.js')
const { iniciarFila } = await import('./fila.js')
const { iniciarPainel } = await import('./painel.js')
const { iniciarBackup } = await import('./backup.js')

await wa.conectar()
iniciarFila(wa)
iniciarPainel(wa)
iniciarBackup()

