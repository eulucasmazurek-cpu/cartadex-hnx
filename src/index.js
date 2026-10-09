// Ponto de partida: liga o WhatsApp, a fila de envio e o painel.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo'
// Logo no começo, para um erro solto durante a inicialização não derrubar o bot.

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

