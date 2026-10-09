#!/bin/bash
# Roda NO NOTEBOOK (Debian), uma vez:  sudo bash ~/pokebot/servidor/instalar.sh
# Deixa o notebook pronto como servidor do CartaDex. Pode rodar de novo sem problema.
set -e
[ "$(id -u)" = 0 ] || { echo "Rode com sudo:  sudo bash $0"; exit 1; }
USUARIO="${SUDO_USER:-lucas}"
CASA="$(getent passwd "$USUARIO" | cut -d: -f6)"
BOT="$CASA/pokebot"
DOMINIO_PADRAO="${DOMINIO_NGROK:-}"   # seu domínio fixo do ngrok (dashboard.ngrok.com → Domains)
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

passo "ngrok (acesso ao painel de fora de casa)"
if ! command -v ngrok >/dev/null; then
  curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc -o /etc/apt/trusted.gpg.d/ngrok.asc
  echo "deb https://ngrok-agent.s3.amazonaws.com bookworm main" > /etc/apt/sources.list.d/ngrok.list
  apt-get update -q && apt-get install -y -q ngrok
fi
if ! grep -qs authtoken "$CASA/.config/ngrok/ngrok.yml"; then
  echo "Cole o seu authtoken do ngrok (dashboard.ngrok.com → Your Authtoken) e aperte Enter:"
  read -r TOKEN
  sudo -u "$USUARIO" ngrok config add-authtoken "$TOKEN"
fi
read -r -p "Domínio do ngrok [$DOMINIO_PADRAO]: " DOMINIO
DOMINIO="${DOMINIO:-$DOMINIO_PADRAO}"
[ -n "$DOMINIO" ] || { echo "Informe o domínio do ngrok (ex.: meu-painel.ngrok-free.app)."; exit 1; }
cat > /etc/systemd/system/cartadex-ngrok.service <<X
[Unit]
Description=ngrok do painel CartaDex
After=network-online.target cartadex.service
Wants=network-online.target

[Service]
User=$USUARIO
ExecStart=$(command -v ngrok) http --url=$DOMINIO $PORTA --log=stdout --log-level=warn
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
X

passo "Firewall (só a rede de casa entra; nada aberto para a internet)"
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
systemctl enable --now cartadex.service cartadex-ngrok.service
sleep 5
systemctl --no-pager --lines=0 status cartadex.service cartadex-ngrok.service | grep -E '●|Active' || true

IP="$(hostname -I | awk '{print $1}')"
echo
echo "✅ Pronto!"
echo "   Painel em casa:      http://$IP:$PORTA"
echo "   Painel de fora:      https://$DOMINIO"
echo "   Ver o que o bot faz: cartadex logs   (Ctrl+C para sair)"
if ! sudo -u "$USUARIO" rclone listremotes 2>/dev/null | grep -q .; then
  echo "   Falta: conectar o Google Drive para o backup (veja o README, seção Backup)."
fi
