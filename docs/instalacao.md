# Guia de instalação e uso (Cartadex hNX)

O bot posta no grupo a **foto da carta com a descrição** e logo abaixo uma **enquete com 3 valores + arremate**.
Quando o leilão encerra, ele apura quem ganhou e anuncia no grupo, marcando o ganhador.

**Regras da apuração**
- O arremate vale mais que qualquer lance; entre os lances, vale o maior valor.
- Empate no mesmo valor (ou dois no arremate): ganha **quem votou primeiro**.
- Se a pessoa troca o voto, o horário dela passa a ser o do novo voto.
- Votos que chegam depois do encerramento não contam.

**O que o painel faz**
- **Menu lateral (☰):** no celular, toque no ☰ no canto de cima para abrir; no computador ele fica sempre aberto à esquerda.
  Cinco áreas: **Leilão** (Início, Lotes, Ao vivo, Sem lance), **Vendas** (Vendas, Pagamentos, Remessas, Relatórios),
  **Grupos** (Grupos, Divulgação, Links), **Proteção** (Strikes, Verificação de membros) e **Sistema** (WhatsApp, Usuários,
  Atividade, Backup, Configurações), com um número ao lado de cada item quando tem algo pendente.
- **Configurações:** todo ajuste fica aqui, numa lista por assunto que já mostra como está. As outras telas são só para usar
  e têm um atalho "Ajustes ›" para o item certo.
- **Links:** link da loja (envio automático), link de pagamento fixo e bloqueio de links nos grupos, numa tela só.
- **Início (Quadro):** todas as etapas das cartas lado a lado (para enviar, na fila, ao vivo, vendidas, sem lance).
- **Barra de status** no topo de todas as telas: WhatsApp conectado, grupos, carta sendo enviada, fila. Atualiza sozinha com a tela aberta.
- **Relatórios:** total vendido, ticket médio, taxa de venda, gráfico por dia, por lote e melhores compradores.
- **Mudar várias:** na página do lote, aplica descrição e valores a várias cartas de uma vez.
- **Tirar foto:** adiciona cartas direto da câmera do celular.
- **Lotes:** cadastre muitas cartas de uma vez (selecione várias fotos, cada foto vira uma carta) e ajuste descrição e valores de cada uma.
- **Envio ao grupo:** agora ou agendado, com horário de encerramento automático (ou encerramento manual). Lotes de 50+ cartas entram numa fila e saem uma a uma com intervalo aleatório.
- **Ao vivo:** quem está ganhando cada carta, em tempo real.
- **Sem lance:** escolha quais reenviar (dá para mudar valores antes). A enquete é recriada sem os votos antigos.
- **Vendas e remessas:** as cartas vendidas aparecem agrupadas por comprador; crie a remessa com endereço e acompanhe pagamento, código de rastreio e entrega.
- **Grupos e conexão:** vários grupos no leilão, pausar envios por grupo, sair de um grupo, e **fechar ou abrir** o grupo (fechado, só administradores mandam mensagem): um por um, todos de uma vez ou num horário automático todo dia, com mensagem opcional.
- **Divulgação:** mensagem com texto e foto opcional para os grupos escolhidos, na hora, agendada ou repetindo todo dia / toda semana. O link da loja a cada 1 hora também fica aqui.
- **Configurações:** intervalo entre cartas, pausar a fila, o que fazer ao encerrar e o texto padrão da prévia.

> ⚠️ O bot usa uma biblioteca não oficial do WhatsApp. **Use um número só para o bot** (um chip separado), nunca o seu pessoal: o WhatsApp pode banir números que se comportam como robô. Não diminua muito o intervalo entre cartas.

---

## Teste rápido no celular Android (Termux)

Para testar antes de ter o servidor pronto.

1. Instale o **Termux pelo F-Droid** (f-droid.org). A versão da Play Store é antiga e não funciona direito.
2. Abra o Termux e rode:
   ```bash
   pkg update && pkg upgrade -y
   pkg install -y nodejs unzip
   termux-setup-storage
   ```
   O último comando pede permissão de acesso aos arquivos: aceite.
3. Copie o `pokebot.zip` da pasta Downloads e descompacte:
   ```bash
   cp ~/storage/downloads/pokebot.zip ~ && cd ~ && unzip pokebot.zip && cd pokebot
   cp .env.example .env
   nano .env
   ```
   Defina a senha de cada pessoa nas linhas `SENHA_LUCAS`, `SENHA_VITOR` e `SENHA_BIA` (mínimo 8 caracteres, senhas diferentes). O nome depois de `SENHA_` é o usuário do login. Salve com `Ctrl+O`, `Enter`, e saia com `Ctrl+X` (no Termux, o Ctrl fica na barra acima do teclado).
4. Instale e ligue:
   ```bash
   npm install
   termux-wake-lock
   npm start
   ```
   O `termux-wake-lock` impede o Android de fechar o bot com a tela apagada.
5. Abra `http://localhost:3000/conexao` no navegador do celular, entre com usuário e senha do `.env`, escaneie o QR com o WhatsApp do número do bot e escolha um **grupo de teste**.

**Passando para o servidor depois:** pare o bot no celular (`Ctrl+C`) e copie a pasta `~/pokebot/dados` para a pasta do bot no servidor. Ele continua já conectado, com lotes e vendas. **Nunca deixe os dois ligados ao mesmo tempo.**

---

## Instalação no servidor (notebook com Debian ou VM)

> No notebook com Debian em casa, **pule o passo 5** (liberar porta na Oracle). O firewall do notebook é configurado à parte, com o UFW.

Você vai precisar da VM Ubuntu já criada e de conseguir entrar nela por SSH.

### 1. Instalar o Node.js 22

Na VM:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

O último comando deve mostrar `v22.` alguma coisa (precisa ser 22.13 ou mais novo).

### 2. Mandar a pasta do bot para a VM

No **seu computador**, na pasta onde está o `pokebot`:

```bash
scp -i caminho/da/chave.key -r pokebot ubuntu@IP-DA-VM:~
```

### 3. Configurar os logins do painel

Na VM:

```bash
cd ~/pokebot
cp .env.example .env
nano .env
```

Defina a senha de cada pessoa nas linhas `SENHA_LUCAS`, `SENHA_VITOR` e `SENHA_BIA` (mínimo 8 caracteres, senhas diferentes). O nome depois de `SENHA_` é o usuário do login. Salve com `Ctrl+O`, `Enter`, e saia com `Ctrl+X`.

Depois, cada pessoa pode criar uma senha nova no painel (**Usuários › Minha senha**) e cadastrar o WhatsApp dela. Esqueceu a senha? Na tela de login, **Esqueceu a senha?** manda um código de 6 números para o WhatsApp cadastrado (ou para o administrador, se a pessoa não tiver número). O código vale 10 minutos.

Emergência (ninguém consegue entrar): no servidor, `cartadex zerar-senha lucas` volta a valer a senha do `.env` para esse usuário.

### 4. Instalar as dependências

```bash
npm install
```

### 5. Liberar a porta 3000 do painel

São dois lugares, como na porta 80 do speedtest:

1. **Painel da Oracle:** Networking → Virtual Cloud Networks → sua VCN → Security Lists → Default → *Add Ingress Rules*: Source CIDR `0.0.0.0/0`, protocolo TCP, porta de destino `3000`.
2. **Firewall da VM:**
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
   sudo netfilter-persistent save
   ```

### 6. Ligar e conectar o WhatsApp

```bash
npm start
```

Vai aparecer um QR code no terminal. No celular do **número do bot**: WhatsApp → Aparelhos conectados → Conectar um aparelho → escaneie.
Se preferir, abra `http://IP-DA-VM:3000/conexao` no navegador: o QR aparece lá também.

Depois de conectar, em **Conexão** escolha o grupo do leilão (o número do bot precisa estar no grupo).
Se o grupo só deixa administradores mandarem mensagem, o bot precisa ser admin.

Para parar: `Ctrl+C`.

### 7. Deixar rodando 24h (mesmo fechando o terminal)

```bash
sudo npm install -g pm2
pm2 start npm --name pokebot -- start
pm2 save
pm2 startup
```

O `pm2 startup` mostra um comando começando com `sudo`: copie e rode ele. Assim o bot liga sozinho se a VM reiniciar.

Comandos úteis:
- `pm2 logs pokebot` — ver o que o bot está fazendo (e o QR, se precisar conectar de novo)
- `pm2 restart pokebot` — reiniciar
- `pm2 stop pokebot` — parar

---

## Usando no dia a dia

1. **Lotes → Criar** um lote.
2. **Adicionar cartas:** selecione as fotos (pode ser 50, 100 de uma vez), preencha os valores padrão e envie.
3. Ajuste a descrição e os valores de cada carta e clique em **Salvar alterações**. O bot recusa cartas com valores repetidos ou arremate menor que os lances, e diz qual é o problema.
4. No fim da página, em **Enviar ao grupo**, escolha quando enviar (agora, daqui a alguns minutos ou dia e hora) e quando encerrar (manual, X horas depois ou dia e hora), e clique em **Enviar / agendar**.
   Sem nenhuma carta marcada, vão todas as pendentes do lote.
5. Acompanhe em **No ar**. No horário de encerramento o bot apura e anuncia os ganhadores.
6. Em **Sem lance**, marque as que quer reenviar.
7. Em **Vendas e remessas**, crie a remessa de cada comprador e atualize a situação até a entrega.

Tempo de envio: com o intervalo padrão de 8 a 15 segundos, 50 cartas levam cerca de 10 minutos.

---

## Bom saber

- **Se o bot ficar offline**, os votos feitos nesse tempo chegam quando ele reconectar, com o horário original. A ordem de desempate continua certa.
- **Quem ganhou aparece pelo nome** quando a pessoa já mandou alguma mensagem no grupo com o bot ligado. Em grupos que escondem o número (LID), às vezes só aparece um código; o anúncio no grupo marca a pessoa normalmente.
- **Backup:** tudo fica na pasta `dados/` (banco, fotos e login do WhatsApp). Copie essa pasta de vez em quando:
  `scp -i chave.key -r ubuntu@IP-DA-VM:~/pokebot/dados ./backup-pokebot`
- **Segurança do painel:** ele usa HTTP, então a senha não vai criptografada. Para mais segurança, não abra a porta 3000 e acesse por túnel SSH:
  `ssh -i chave.key -L 3000:localhost:3000 ubuntu@IP-DA-VM` e abra `http://localhost:3000`.
- **Testes:** `npm run teste` verifica a apuração e o fluxo completo com um WhatsApp simulado.

## Estrutura

```
src/index.js      liga tudo
src/whatsapp.js   conexão (QR code), postagem de foto + enquete, recepção dos votos
src/votos.js      transforma os votos do WhatsApp em lances
src/leilao.js     regras: valores, opções da enquete, apuração, texto do resultado
src/fila.js       fila de envio, agendamentos, encerramentos, link da loja
src/painel.js     rotas do painel
src/paginas.js    HTML das páginas
src/db.js         banco SQLite
```

## Backup no Google Drive

Todo dia, a partir das 3h (dá para mudar em **Configurações → Backup**), o bot:

1. faz uma cópia do banco (lotes, cartas, lances, vendas, remessas, grupos e configurações);
2. guarda as últimas 7 cópias em `dados/backups/`;
3. envia a cópia e as fotos novas para o Google Drive, na pasta `CartaDex`.

O login do WhatsApp e o arquivo `.env` (senhas) não vão para o backup, por segurança.
Guarde as senhas do painel em outro lugar seguro.

### Conectar o Google Drive (uma vez só)

No servidor:

```
sudo apt install -y curl unzip
sudo -v ; curl https://rclone.org/install.sh | sudo bash
rclone config
```

No `rclone config`, responda: `n` (novo), nome `gdrive`, tipo `drive`, client_id e client_secret em branco,
escopo `drive.file` (o rclone só enxerga o que ele mesmo criou no seu Drive), Enter, `n` nas opções avançadas
e `n` para abrir o navegador. Ele mostra um comando `rclone authorize "drive" "..."`:
rode esse comando no Termux do celular (antes: `pkg install rclone`), abra o link, entre na conta Google e permita.
Copie o código que aparece no Termux, cole no servidor, responda `n` (não é Drive compartilhado), `y` e `q`.

Depois, no painel, **Menu ☰ → Backup → Fazer backup agora**.

### Restaurar

Com o bot desligado, na pasta do bot:

```
npm run restaurar              # último backup do Google Drive (banco e fotos)
npm run restaurar -- --local   # última cópia guardada no próprio servidor
```

O banco atual não é apagado: fica guardado como `dados/pokebot.db.antes-<data>`.
Ao ligar o bot de novo, se aparecer QR code, escaneie com o WhatsApp do número do bot.

## Fechar e abrir os grupos

Em **Menu ☰ → Grupos e conexão**:

- **Fechar** deixa só os administradores mandarem mensagem no grupo; **Abrir** libera para todo mundo.
- Dá para fazer em cada grupo, em todos de uma vez, ou ligar o **horário automático** (por exemplo, fechar às 23h e abrir às 8h), com uma mensagem opcional ao fechar e ao abrir.
- O número do bot precisa ser **administrador** do grupo. Se não for, a tela avisa.
- Antes de fechar um grupo durante um leilão, teste com uma carta se o pessoal consegue votar na enquete com o grupo fechado.

## Divulgação

Em **Menu ☰ → Divulgação**: escreva a mensagem, escolha uma foto (opcional) e os grupos, e mande na hora,
num dia e hora marcados, ou repetindo todo dia ou toda semana. As agendadas e as já enviadas ficam listadas,
com botões para enviar de novo ou apagar. Grupos pausados não recebem divulgação.

## Strikes e bloqueios

Quem **tira o lance** depois do prazo (padrão: 2 minutos depois de votar) leva **1 strike**. Trocar de lance
nunca dá strike. Com **3 strikes** (padrão) a pessoa é **bloqueada**: os votos dela deixam de valer até alguém
desbloquear em **Menu ☰ → Strikes e bloqueios**. Prazo, número de strikes e ligar/desligar ficam em **Configurações**.
Na mesma tela dá para tirar um strike, zerar, bloquear na hora ou bloquear um número.

## Verificação de membros (golpe e spam)

Em **Menu ☰ → Verificação de membros**, o bot lê os membros de todos os grupos do leilão e marca quem tem
sinais de risco: número de fora do Brasil, DDD que não existe, número fixo, link ou propaganda mandados no grupo,
nome suspeito ("suporte", "oficial", "renda"...), quem entrou há menos de 3 dias, bloqueados e quem tem strike.
Para cada pessoa dá para **remover do grupo** (o bot precisa ser administrador), **bloquear os votos** ou marcar
como **confiável**. A verificação roda sozinha uma vez por dia, e quem entra com alto risco aparece na Atividade.
São sinais, não prova: não existe uma lista pública de números de golpe. Confira antes de remover.

## Gerenciador de links

Em **Menu ☰ → Gerenciador de links**: ligado, o bot apaga na hora os links mandados nos grupos do leilão por quem
não pode mandar. Podem mandar: **administradores** do grupo, **números autorizados** (cadastre na mesma tela) e
qualquer pessoa, se o link for de um **site liberado** (ex.: o da sua loja). Dá para mandar um aviso marcando a pessoa.
O WhatsApp não deixa impedir o envio, então o bot apaga logo depois que chega, e para isso precisa ser **administrador**.

## Servidor no notebook (Debian)

Scripts na pasta `servidor/`:

- `empacotar-celular.sh` (no Termux): junta `dados/`, `.env` e as configurações do ngrok e do rclone em `~/cartadex-mudanca.tgz`.
- `instalar.sh` (no notebook, com `sudo`): traz esses dados, instala o Node 22, deixa o bot e o ngrok ligando sozinhos,
  liga o firewall e as atualizações automáticas, e faz o notebook não dormir com a tampa fechada.
- `cartadex` (comando no notebook): `cartadex logs`, `status`, `reiniciar`, `parar`, `ligar`, `atualizar`.

Para atualizar o bot depois: mande o `pokebot.zip` novo para a pasta do usuário no notebook e rode `cartadex atualizar`.

## Mensagem para o ganhador

Em **Configurações → Mensagem para o ganhador**: ligado, ao encerrar uma carta o bot manda no privado de quem ganhou
a foto de cada carta e depois uma mensagem com o total e o link de pagamento. Quem ganha várias cartas no mesmo
encerramento recebe tudo numa conversa só. Entre um ganhador e outro o bot espera alguns segundos.
`{nome}`, `{cartas}`, `{total}` e `{link}` são trocados na mensagem; no link, `{valor}` vira o total (ex.: 150.00).
Fotos: por padrão vão num **mural**, uma imagem só com todas as cartas ganhas (número e valor embaixo de cada uma,
até 16 por imagem). Precisa do ImageMagick no servidor (`sudo apt install -y imagemagick fonts-dejavu-core`); sem ele,
ou escolhendo "Uma foto por carta" em Configurações → Encerramento e ganhador, vai uma foto por carta.
Em **Vendas**, cada comprador mostra se foi avisado e tem o botão **Mandar aviso de novo**.

## Pagamento e cobrança

Em **Configurações → Pagamento e cobrança**:

- **Mercado Pago:** cole o **Access Token** de produção (Seu negócio → Configurações → Credenciais). Com ele, cada ganhador
  recebe um link próprio com o valor certo (Pix ou cartão; boleto fica de fora), e o bot confere sozinho a cada 2 minutos
  se o pagamento caiu. Quando cai: marca como pago, para os lembretes, manda a confirmação para a pessoa e, se a carta já
  estiver numa remessa "Aguardando pagamento", muda para "Pago, separar". O botão **Salvar e testar** confere o token.
- **Lembretes:** 2 por dia, nos horários escolhidos, até pagar ou até você tocar em **Parar cobrança** (em Vendas).
  O primeiro só sai pelo menos 6 horas depois do aviso.
- Sem Mercado Pago, vale o link fixo da mensagem do ganhador e você toca em **Marcar como pago** em Vendas.

Em **Vendas**, a seção **Pagamentos em aberto** lista quem deve, quantos lembretes já foram e os botões
**Marcar como pago** e **Parar cobrança**.

## Rastreio das remessas

Em **Remessas**, ao salvar um código de rastreio, o bot manda o código para o comprador no privado e marca a remessa como
**Enviado** (Configurações → Rastreio liga e desliga isso e muda a mensagem). O botão **Mandar código** manda de novo.

Leitura automática: com a chave do **PacoteVício** (RapidAPI, plano Basic grátis, 1.000 consultas por mês), o bot confere
cada remessa no intervalo escolhido (Correios, Total Express e Anjun) e avisa o comprador a cada etapa: postado, a caminho,
saiu para entrega, aguardando retirada, entregue ou problema. Ao chegar em "entregue", a remessa muda para **Entregue** e
para de ser consultada. Problemas (não entregue, devolvido...) aparecem também em Atividade. Outras transportadoras
(Jadlog, Loggi...) recebem só o código, sem leitura automática.

## Lotes

Cada lote abre separado em abas: **Para enviar, Na fila, Ao vivo, Sem lance e Vendidas**. As cartas ficam em grade;
marque as que quiser e use a barra de baixo (Enviar, Prévia, Valores em massa, Tirar da fila, Encerrar, Reenviar,
Excluir). Sem nenhuma marcada, a ação vale para todas as cartas da aba. Tocar numa carta abre a janela dela
(descrição, 3 lances e arremate), com **Anterior/Próxima** e **Salvar e próxima** para cadastrar em sequência.
Descrição e valores só mudam dentro do lote. Renomear e excluir o lote ficam no botão "···". A lista de Lotes separa
**Em andamento** e **Finalizados** (sem nada para enviar nem ao vivo).
