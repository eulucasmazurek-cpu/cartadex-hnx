#!/data/data/com.termux/files/usr/bin/bash
# Roda NO CELULAR (Termux). Junta tudo que o notebook precisa para continuar de onde o celular parou:
# banco, fotos e login do WhatsApp (pasta dados), senhas (.env), e a configuração do rclone.
# Antes de rodar, PARE o bot no celular (Ctrl+C na tela dele).
set -e
cd ~
if pgrep -f "src/index.js" >/dev/null 2>&1; then
  echo "⚠️  O bot ainda está rodando no celular. Pare ele (Ctrl+C na tela do bot) e rode este script de novo."
  exit 1
fi
[ -d pokebot/dados ] || { echo "Não achei a pasta ~/pokebot/dados."; exit 1; }
itens="pokebot/dados"
[ -f pokebot/.env ] && itens="$itens pokebot/.env"
[ -d .config/rclone ] && itens="$itens .config/rclone"
tar czf cartadex-mudanca.tgz $itens
echo "✅ Pronto: ~/cartadex-mudanca.tgz ($(du -h cartadex-mudanca.tgz | cut -f1))"
echo "   Levou: $itens"
