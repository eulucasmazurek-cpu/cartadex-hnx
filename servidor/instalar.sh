#!/bin/bash
# Roda NO NOTEBOOK (Debian), uma vez:  sudo bash ~/pokebot/servidor/instalar.sh
# Deixa o notebook pronto como servidor do CartaDex. Pode rodar de novo sem problema.
set -e
[ "$(id -u)" = 0 ] || { echo "Rode com sudo:  sudo bash $0"; exit 1; }
USUARIO="${SUDO_USER:-lucas}"
CASA="$(getent passwd "$USUARIO" | cut -d: -f6)"
BOT="$CASA/pokebot"
DOMINIO_PADRAO="${DOMINIO_PAINEL:-}"   # ex.: painel.seudominio.com.br (o nome configurado no túnel da Cloudflare)
passo () { echo; echo "==> $*"; }
[ -f "$BOT/package.json" ] || { echo "Não achei $BOT. Descompacte o pokebot.zip na pasta $CASA primeiro."; exit 1; }

passo "Trazendo os dados do celular (se o arquivo estiver aqui)"
if [ -f "$CASA/cartadex-mudanca.tgz" ]; then
  if [ -d "$BOT/dados/login-whatsapp" ]; then
    echo "Já existe um login do WhatsApp aqui; não vou sobrescrever. (Apague $BOT/dados para trazer de novo.)"
  else
    tar xzf "$CASA/cartadex-mudanca.tgz" -C "$CASA"
    chown -R "$USUARIO:$USUARIO" "$BOT" "$CASA/.config" 2>/dev/null || true
    echo "Dados do celular trazidos."
  fi
else
  echo "Arquivo cartadex-mudanca.tgz não encontrado; o bot vai começar do zero (vai pedir o QR code)."
fi

passo "Programas básicos e atualizações"
export DEBIAN_FRONTEND=noninteractive
sed -i '/^deb cdrom:/s/^/#/' /etc/apt/sources.list 2>/dev/null || true
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg unzip ufw unattended-upgrades rclone systemd-timesyncd imagemagick fonts-dejavu-core
timedatectl set-timezone America/Sao_Paulo || true
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'X'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
X

passo "Notebook continua ligado com a tampa fechada"
mkdir -p /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/cartadex.conf <<'X'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
X
systemctl mask -q sleep.target suspend.target hibernate.target hybrid-sleep.target
systemctl kill -s HUP systemd-logind || true

passo "Node.js 22"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
echo "Node $(node -v)"

passo "Instalando o bot"
cd "$BOT"
if [ ! -f .env ]; then
  cp .env.example .env; chown "$USUARIO:$USUARIO" .env
  echo "⚠️  Criei um .env novo. Troque as senhas antes de usar:  nano $BOT/.env"
fi
chmod 600 .env
sudo -u "$USUARIO" npm install --omit=dev --no-audit --no-fund
PORTA="$(grep -E '^PORTA=' .env | cut -d= -f2)"; PORTA="${PORTA:-3000}"

cat > /etc/systemd/system/cartadex.service <<X
[Unit]
Description=CartaDex (bot do leilao)
After=network-online.target
Wants=network-online.target

[Service]
User=$USUARIO
WorkingDirectory=$BOT
Environment=LOG_BAILEYS=warn
ExecStart=$(command -v node) --env-file=.env src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
X

passo "Cloudflare Tunnel (acesso ao painel de fora de casa, sem abrir porta no roteador)"
# O ngrok antigo, se existir, sai de cena.
if systemctl list-unit-files cartadex-ngrok.service 2>/dev/null | grep -q cartadex-ngrok; then
  systemctl disable --now cartadex-ngrok.service || true
  rm -f /etc/systemd/system/cartadex-ngrok.service
  echo "ngrok antigo desligado."
fi
if ! command -v cloudflared >/dev/null; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -q && apt-get install -y -q cloudflared
fi
if systemctl list-unit-files cloudflared.service 2>/dev/null | grep -q cloudflared; then
  echo "Túnel da Cloudflare já instalado."
else
  echo "Cole o token do túnel e aperte Enter (não aparece na tela)."
  echo "  Onde pegar: one.dash.cloudflare.com → Networks → Tunnels → seu túnel → Configure → o comando de instalação."
  echo "  É a parte longa depois de 'service install' (começa com eyJ). Não mande esse token para ninguém."
  read -rs TOKEN; echo
  if [ -n "$TOKEN" ]; then cloudflared service install "$TOKEN"; else echo "⚠️  Sem token: o painel só vai abrir dentro de casa. Rode este script de novo depois."; fi
  unset TOKEN
fi
read -r -p "Endereço do painel na internet [$DOMINIO_PADRAO]: " DOMINIO
DOMINIO="${DOMINIO:-$DOMINIO_PADRAO}"

passo "Firewall (só a rede de casa entra; nada aberto para a internet: o túnel da Cloudflare sai de dentro para fora)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for rede in 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12; do
  ufw allow from $rede to any port 22 proto tcp >/dev/null
  ufw allow from $rede to any port "$PORTA" proto tcp >/dev/null
done
ufw --force enable

passo "Comando de atalho 'cartadex'"
install -m 755 "$BOT/servidor/cartadex" /usr/local/bin/cartadex

passo "Ligando tudo"
systemctl daemon-reload
systemctl enable --now cartadex.service
sleep 5
systemctl --no-pager --lines=0 status cartadex.service cloudflared.service 2>/dev/null | grep -E '●|Active' || true

IP="$(hostname -I | awk '{print $1}')"
echo
echo "✅ Pronto!"
echo "   Painel em casa:      http://$IP:$PORTA"
[ -n "$DOMINIO" ] && echo "   Painel de fora:      https://$DOMINIO   (pede o código por e-mail da Cloudflare)"
echo "   Ver o túnel:         cartadex tunel"
echo "   Ver o que o bot faz: cartadex logs   (Ctrl+C para sair)"
if ! sudo -u "$USUARIO" rclone listremotes 2>/dev/null | grep -q .; then
  echo "   Falta: conectar o Google Drive para o backup (veja o GOOGLE-DRIVE.md)."
fi
