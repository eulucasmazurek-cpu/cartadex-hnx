// Páginas do painel (HTML gerado no servidor, sem dependências).
import { moeda, valorCampo, numCarta } from './leilao.js'
import { nomeContato } from './db.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const dois = n => String(n).padStart(2, '0')
export function lerData (s) {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}
export function dataHora (ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`
}
const hora = ms => { const d = new Date(ms); return `${dois(d.getHours())}:${dois(d.getMinutes())}` }
const quando = (ms, agora = Date.now()) => {
  const d = new Date(ms); const h = new Date(agora)
  if (d.toDateString() === h.toDateString()) return `hoje, ${hora(ms)}`
  h.setDate(h.getDate() + 1)
  if (d.toDateString() === h.toDateString()) return `amanhã, ${hora(ms)}`
  return dataHora(ms)
}
// "agora", "há 5 min", "há 2 h", ou a data.
export function haQuanto (ms, agora = Date.now()) {
  const s = Math.max(0, Math.round((agora - ms) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return dataHora(ms)
}
const primeiraLinha = t => esc(String(t || '').split('\n')[0])
export const nomeCurto = jid => nomeContato(jid).replace(/ \(\+\d+\)$/, '')
const reais = v => moeda(v || 0)

export const STATUS = {
  pendente: ['Pendente', 'neutro'],
  agendada: ['Agendada', 'fila'],
  fila: ['Na fila', 'fila'],
  no_ar: ['Ao vivo', 'vivo'],
  vendida: ['Vendida', 'ok'],
  sem_lance: ['Sem lance', 'alerta']
}
const selo = (st, id = '') => { const [t, c] = STATUS[st] || [st, 'neutro']; return `<span class="selo ${c}"${id ? ` data-selo="${id}"` : ''}>${t}</span>` }

export const STATUS_REMESSA = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago, separar',
  enviado: 'Enviado',
  entregue: 'Entregue'
}
const COR_REMESSA = { aguardando_pagamento: 'alerta', pago: 'fila', enviado: 'vivo', entregue: 'ok' }

const ICONE = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  lotes: '<rect x="4" y="7" width="12" height="14" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>',
  vivo: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  vendas: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  mais_add: '<path d="M12 5v14M5 12h14"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  mais: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  galeria: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  voltar: '<path d="M15 6l-6 6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  martelo: '<path d="M14 4l6 6M11 7l6 6M12.5 5.5l-5 5 6 6 5-5M8 14l-5 5"/>',
  semlance: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
  relatorios: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  grupos: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.4.6 4 2.8 4 6"/>',
  megafone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  atividade: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  backup: '<path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 7a4.5 4.5 0 0 1 .5 9"/><path d="M12 12v8M9 15l3-3 3 3"/>',
  ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8.5 11l1.8 1.8L14 9"/>',
  cartao: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  caminhao: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  whats: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a3.6 3.6 0 0 1-1.8-1.8l.8-1-1-2z"/>',
  enviar: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
  corrente: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
  aberto: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'
}
const icone = (n, t = 22) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[n]}</svg>`


const CSS = `
.novidades{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:60;border:0;border-radius:999px;padding:11px 18px;font:inherit;font-weight:750;font-size:14px;background:var(--volt);color:var(--volt-t);box-shadow:0 6px 24px rgba(0,0,0,.35);cursor:pointer}
:root{color-scheme:dark;
--bg:#131418;--sup:rgba(32,33,39,.86);--sup2:#24252b;--linha:#2f3037;--texto:#ededf0;--suave:#9c9ea7;
--volt:#f2c218;--volt-t:#1c1600;--vivo:#6cb4ff;--vivo-f:#1b2a3d;--ok:#5dcf94;--ok-f:#173026;--alerta:#ff8a8a;--alerta-f:#3a1f23;
--fila:#ada4ff;--fila-f:#28263e;--neutro-f:#2a2b31;--foco:#6cb4ff;
--holo:linear-gradient(100deg,#f2c218 0%,#ff9a62 20%,#e08cff 40%,#7fb6ff 60%,#f2c218 80%,#ff9a62 100%);--holo-sombra:rgba(0,0,0,.4);
--volt-txt:#f2c218;--volt-f:#3a3216;--laranja:#ffb36b;--laranja-f:#3a2a1a;--apagado:#74767f;--linha2:#3a3b42;--ponto:#4a4b52;
--gaveta:#17181d;--sup3:#1f2026;--janela:#1b1c21;--barra:#24252b;--veu:rgba(5,6,9,.62);--sombra:rgba(0,0,0,.5);
--brilho1:rgba(242,194,24,.11);--brilho2:rgba(140,110,255,.12)}
:root[data-tema="claro"]{color-scheme:light;
--bg:#f3f3f6;--sup:rgba(255,255,255,.92);--sup2:#ebebf0;--linha:#dcdce3;--texto:#17181c;--suave:#5c5f69;
--volt:#f2c218;--volt-t:#1c1600;--volt-txt:#8a6a00;--volt-f:#fbf1c8;--vivo:#1d6fd6;--vivo-f:#e2eefc;--ok:#13804f;--ok-f:#dcf2e6;--alerta:#c4343a;--alerta-f:#fbe4e5;
--fila:#5b4fd6;--fila-f:#ebe9ff;--neutro-f:#e8e8ed;--foco:#1d6fd6;--laranja:#b85e00;--laranja-f:#fdebd9;--apagado:#8a8c95;--linha2:#cfd0d8;--ponto:#c4c5cc;
--gaveta:#ffffff;--sup3:#ffffff;--janela:#ffffff;--barra:#ffffff;--veu:rgba(20,22,30,.35);--sombra:rgba(30,32,45,.16);
--brilho1:rgba(242,194,24,.16);--brilho2:rgba(140,110,255,.10);--holo-sombra:rgba(0,0,0,.12)}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
html{background:var(--bg)}
body{margin:0;min-height:100vh;background:radial-gradient(900px 420px at 0% -8%,var(--brilho1),transparent 62%),radial-gradient(800px 460px at 105% 4%,var(--brilho2),transparent 60%),var(--bg) no-repeat;color:var(--texto);font:15px/1.5 "Archivo",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variation-settings:"wdth" 100;padding-bottom:24px}
a{color:var(--vivo)}
:focus-visible{outline:2px solid var(--foco);outline-offset:2px}
.larga{font-variation-settings:"wdth" 118}
.topo-app{position:sticky;top:0;z-index:6;display:flex;align-items:center;gap:10px;padding:10px 16px;background:color-mix(in srgb,var(--bg) 82%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--linha)}
.marca{flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.marca b{font-weight:900;font-size:21px;letter-spacing:-.015em;font-variation-settings:"wdth" 125;font-style:italic;
background:var(--holo);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
filter:drop-shadow(0 1px 0 var(--holo-sombra));animation:holo 7s linear infinite}
.marca i{width:15px;height:21px;border-radius:3px;background:var(--holo);background-size:250% 100%;transform:rotate(-10deg);
box-shadow:inset 0 0 0 2px color-mix(in srgb,#fff 45%,transparent);animation:holo 7s linear infinite}
@keyframes holo{from{background-position:0 0}to{background-position:-250% 0}}
@media (prefers-reduced-motion:reduce){.marca b,.marca i{animation:none}}
.estado{margin-left:auto;display:flex;align-items:center;gap:6px;min-width:0}
.pilula{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:4px 10px;border-radius:99px;background:var(--neutro-f);color:var(--suave);white-space:nowrap}
.pilula i{width:8px;height:8px;border-radius:50%;background:currentColor}
.pilula.on{background:var(--ok-f);color:var(--ok)}.pilula.off{background:var(--alerta-f);color:var(--alerta)}
.pilula.fila{background:var(--fila-f);color:var(--fila)}
.grupo-nome{font-size:13px;color:var(--suave);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:34vw}
.tema{flex:none;position:relative;width:62px;height:32px;min-height:32px;padding:0;border-radius:99px;border:1px solid var(--linha);background:var(--sup2);display:inline-flex;align-items:center;justify-content:space-between;padding:0 8px;color:var(--suave);cursor:pointer}
.tema svg{position:relative;z-index:1;transition:color .25s}
.tema::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:var(--texto);transition:transform .25s ease,background .25s}
.tema .t-lua{color:var(--bg)}.tema .t-sol{color:var(--suave)}
:root[data-tema="claro"] .tema::after{transform:translateX(30px);background:var(--volt)}
:root[data-tema="claro"] .tema .t-sol{color:var(--volt-t)}:root[data-tema="claro"] .tema .t-lua{color:var(--suave)}
@media (prefers-reduced-motion:reduce){.tema::after{transition:none}}
@media (max-width:460px){.tema{width:54px;height:30px;min-height:30px;padding:0 6px}.tema::after{width:22px;height:22px}:root[data-tema="claro"] .tema::after{transform:translateX(24px)}
#pilula b{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}#pilula{padding:9px}.grupo-nome{display:none}}
.abrir-menu{flex:none;width:40px;height:40px;min-height:40px;padding:0;margin-left:-4px;border-radius:12px;background:var(--sup2)}
.veu{position:fixed;inset:0;z-index:20;background:var(--veu);opacity:0;pointer-events:none;transition:opacity .2s ease}
.gaveta{position:fixed;top:0;bottom:0;left:0;z-index:21;width:min(310px,86vw);display:flex;flex-direction:column;background:var(--gaveta);border-right:1px solid var(--linha);box-shadow:24px 0 60px var(--sombra);transform:translateX(-105%);transition:transform .22s ease;visibility:hidden}
body.menu-aberto .gaveta{transform:none;visibility:visible}body.menu-aberto .veu{opacity:1;pointer-events:auto}body.menu-aberto{overflow:hidden}
.g-topo{display:flex;align-items:center;height:62px;padding:0 12px 0 16px;flex:none}
.g-topo .fechar{margin-left:auto;width:38px;height:38px;min-height:38px;padding:0;border-radius:12px;background:var(--sup2)}
.g-status{margin:0 12px 4px;padding:10px 12px;border-radius:14px;background:var(--sup2);border:1px solid var(--linha);flex:none;font-size:13px;color:var(--suave)}
.g-status b{display:flex;align-items:center;gap:7px;font-size:14px}.g-status b i{width:8px;height:8px;border-radius:50%;background:currentColor}
.g-status .on{color:var(--ok)}.g-status .off{color:var(--alerta)}
.g-corpo{flex:1;overflow-y:auto;overscroll-behavior:contain;padding-bottom:10px}
.g-sec{font-size:11.5px;font-weight:750;letter-spacing:.09em;color:var(--apagado);text-transform:uppercase;padding:12px 20px 3px}
.g-item{display:flex;align-items:center;gap:12px;margin:0 8px;padding:8px 12px;border-radius:12px;color:var(--texto);font-weight:600;font-size:15px;text-decoration:none;min-height:40px}
.g-item svg{color:var(--suave);flex:none}.g-item:hover{background:var(--sup2)}
.g-item.atual{background:color-mix(in srgb,var(--volt) 14%,transparent);color:var(--volt-txt)}.g-item.atual svg{color:var(--volt-txt)}
.g-item .n{margin-left:auto;min-width:24px;height:22px;padding:0 7px;border-radius:99px;font-size:12px;font-weight:750;display:inline-grid;place-items:center;background:var(--neutro-f);color:var(--suave)}
.g-item .n.vivo{background:var(--vivo-f);color:var(--vivo)}.g-item .n.alerta{background:var(--alerta-f);color:var(--alerta)}.g-item .n.fila{background:var(--fila-f);color:var(--fila)}.g-item .n.ok{background:var(--ok-f);color:var(--ok)}
.g-item .txt{margin-left:auto;font-size:12.5px;font-weight:650;color:var(--ok)}.g-item .txt.ruim{color:var(--alerta)}
.g-pe{border-top:1px solid var(--linha);padding:12px 16px 16px;display:flex;align-items:center;gap:10px;flex:none}
.g-sair{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 12px;border-radius:12px;background:var(--sup2);color:var(--suave);font-size:14px;font-weight:600}
.g-pe .av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#131418;background:linear-gradient(135deg,var(--volt),#c9a7ff);flex:none}
main{max-width:1080px;margin:0 auto;padding:18px 16px 24px}
h1{font-size:28px;line-height:1.15;margin:0 0 16px;font-weight:750;font-variation-settings:"wdth" 118;letter-spacing:-.01em}
h2{font-size:18px;margin:28px 0 10px;font-weight:700;font-variation-settings:"wdth" 112;display:flex;align-items:center;gap:8px}
h2 small{font-size:13px;font-weight:500;color:var(--suave);font-variation-settings:"wdth" 100;margin-left:auto}
h2 small a{text-decoration:none}
.bloco{background:var(--sup);border:1px solid var(--linha);border-radius:16px;padding:16px;margin-bottom:14px}
.aviso{padding:12px 14px;border-radius:12px;margin-bottom:14px;background:var(--vivo-f);color:var(--vivo)}
.aviso.erro{background:var(--alerta-f);color:var(--alerta)}
.aviso a{color:inherit;font-weight:700}
.suave{color:var(--suave);font-size:13px}
label{display:block;font-size:13px;color:var(--suave);margin:10px 0 4px;font-weight:500}
input,select,textarea{width:100%;padding:10px 11px;border:1px solid var(--linha);border-radius:10px;background:var(--sup2);color:var(--texto);font:inherit;font-size:16px}
input:focus,select:focus,textarea:focus{border-color:var(--foco);outline:none}
textarea{min-height:46px;resize:vertical}
input[type=checkbox]{width:22px;height:22px;padding:0;accent-color:var(--volt);flex:none}
button,.botao{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:10px 16px;border-radius:12px;border:1px solid var(--linha);background:var(--sup);color:var(--texto);font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
button.prim,.botao.prim{background:var(--volt);border-color:var(--volt);color:var(--volt-t)}
button.perigo{color:var(--alerta)}
button:disabled{opacity:.45;cursor:default}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.acoes .selo{align-self:center}
/* lote */
.lote-cab{display:flex;align-items:center;gap:10px}.lote-cab h1{margin:0;flex:1;min-width:0}
.menu-mais{position:relative}.menu-mais summary{list-style:none;width:40px;height:40px;border-radius:12px;border:1px solid var(--linha);background:var(--sup2);display:grid;place-items:center;font-weight:900;letter-spacing:1px;cursor:pointer}
.menu-mais summary::-webkit-details-marker{display:none}
.menu-mais summary::after{display:none!important}
button.perigo.link{color:var(--alerta)}
.menu-mais>div{position:absolute;right:0;top:46px;z-index:20;width:min(300px,86vw);background:var(--sup3);border:1px solid var(--linha);border-radius:16px;padding:12px;box-shadow:0 18px 40px var(--sombra)}
.menu-mais label{margin-top:0}
.lote-res{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 10px}
.abas-lote{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 12px;padding:2px 16px}
.abas-lote a{flex:none;display:inline-flex;gap:6px;align-items:center;padding:8px 13px;border-radius:99px;border:1px solid var(--linha);background:var(--sup2);color:var(--suave);font-weight:650;font-size:14px;text-decoration:none}
.abas-lote a.atual{background:var(--volt);border-color:var(--volt);color:var(--volt-t)}.abas-lote i{font-style:normal;font-size:12px;opacity:.75}
.add-fotos summary b{display:inline-flex;align-items:center;gap:6px}
.dica-lote{margin:0 2px 10px;font-size:13px}
.link-lote{display:block;font-size:12.5px;margin-top:4px;color:var(--vivo);text-decoration:none;font-weight:650}
.grade-lote{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-bottom:120px}
@media(min-width:620px){.grade-lote{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1100px){.grade-lote{grid-template-columns:repeat(5,minmax(0,1fr))}}
.cx{position:relative;background:var(--sup);border:1px solid var(--linha);border-radius:14px;padding:7px 7px 9px;min-width:0}
.cx.sel{border-color:var(--volt);box-shadow:0 0 0 2px var(--volt) inset}
.cx-foto{display:block;padding:0;border:0;background:none;width:100%;min-height:0;cursor:pointer;border-radius:8px;overflow:hidden}
.cx-foto img{width:100%;aspect-ratio:5/7;object-fit:cover;display:block;border-radius:8px}
.cx b{display:block;font-size:13.5px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cx small{display:block;color:var(--suave);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cx small.falta{color:var(--alerta);font-weight:650}
.cx .erro-carta{font-size:11.5px}
.mk{position:absolute;top:12px;left:12px;z-index:2;margin:0}
.mk input{position:absolute;opacity:0;width:30px;height:30px;margin:-3px;cursor:pointer}
.mk span{width:26px;height:26px;border-radius:8px;background:rgba(19,20,24,.7);border:2px solid #fff;display:grid;place-items:center;color:transparent}
.mk input:checked+span{background:var(--volt);border-color:var(--volt);color:var(--volt-t)}
.mk input:focus-visible+span{outline:2px solid var(--vivo);outline-offset:2px}
.barra-lote{position:fixed;left:12px;right:12px;bottom:12px;z-index:9;background:var(--barra);border:1px solid var(--linha2);border-radius:18px;padding:10px;box-shadow:0 10px 40px var(--sombra)}
@media(min-width:900px){.barra-lote{left:304px;right:24px}}
.bl-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13.5px;margin:0 4px 8px}
button.icone-so{min-width:44px;padding:0 10px;display:inline-grid;place-items:center}.acoes>button.icone-so:last-child{margin-left:auto}
.bl-bts{display:flex;gap:7px}.bl-bts>*{flex:1;min-height:44px;padding:6px 8px}.bl-bts .icone-so{flex:0 0 48px}
button.link{background:none;border:0;min-height:0;padding:0;color:var(--vivo);font-weight:650}
dialog.janela{width:min(520px,calc(100vw - 20px));max-height:calc(100dvh - 40px);overflow:auto;background:var(--janela);color:var(--texto);border:1px solid var(--linha);border-radius:22px;padding:16px;margin:auto auto 10px}
@media(min-width:620px){dialog.janela{margin:auto}}
dialog.janela::backdrop{background:var(--veu)}
.j-cab{display:flex;align-items:center;gap:10px;margin-bottom:4px}.j-cab b{font-size:19px}.j-cab .fechar{margin-left:auto;width:38px;height:38px;min-height:0;padding:0}
.j-alvo{margin:0 0 6px}
.jc-corpo{display:flex;gap:12px;margin-top:8px}.jc-corpo img{width:96px;border-radius:8px;align-self:flex-start}
.jc-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}

.rastreio{display:grid;gap:4px;padding:10px 12px;margin:8px 0 2px;border-radius:12px;background:var(--sup2);border:1px solid var(--linha);font-size:14px}
.numeros a{text-decoration:none;color:inherit}
.cfg-lista{background:var(--sup);border:1px solid var(--linha);border-radius:16px;overflow:hidden}
.cfg-item{display:flex;align-items:center;gap:13px;padding:13px 14px;border-top:1px solid var(--linha);text-decoration:none;color:var(--texto)}.cfg-item:first-child{border-top:0}
.cfg-item b{display:block;font-size:15px}.cfg-item small{display:block;color:var(--suave);font-size:13px;line-height:1.3}
.cfg-item>svg{margin-left:auto;color:var(--apagado);flex:none}.cfg-item:hover{background:var(--sup2)}
.cfg-ico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none}
h2.cfg-area{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--apagado);margin:18px 4px 7px}
.linha{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.selo{display:inline-block;font-size:12px;font-weight:650;padding:2px 9px;border-radius:99px;background:var(--neutro-f);color:var(--suave);white-space:nowrap}
.selo.ok{background:var(--ok-f);color:var(--ok)}.selo.alerta{background:var(--alerta-f);color:var(--alerta)}
.selo.fila{background:var(--fila-f);color:var(--fila)}.selo.vivo{background:var(--vivo-f);color:var(--vivo)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px 6px;border-bottom:1px solid var(--linha);font-size:14px;vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-size:13px;color:var(--suave);font-weight:600}
.tabela{overflow-x:auto}

/* Faixa de cartas ao vivo, com etiqueta no estilo das cartas graduadas */
.faixa{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -16px;padding:2px 16px 8px;scrollbar-width:none}
.slab{flex:none;width:156px;scroll-snap-align:start;background:var(--sup);border:2px solid var(--linha);border-radius:12px;padding:6px;text-decoration:none;color:var(--texto);display:flex;flex-direction:column;gap:6px}
.slab-rotulo{background:var(--volt);color:var(--volt-t);border-radius:6px;padding:6px 8px 7px;display:grid;grid-template-columns:1fr auto;align-items:baseline;row-gap:1px}
.slab-rotulo .n{font-size:12px;font-weight:700;opacity:.75}
.slab-rotulo .lance{font-size:19px;font-weight:800;font-variation-settings:"wdth" 120;grid-column:1/-1;line-height:1.1;font-variant-numeric:tabular-nums}
.slab-rotulo .quem{font-size:12px;font-weight:600;grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.slab-rotulo.vazio{background:var(--neutro-f);color:var(--suave)}
.slab-janela{border-radius:6px;background:var(--sup2);border:1px solid var(--linha);aspect-ratio:5/7;overflow:hidden}
.slab-janela img{width:100%;height:100%;object-fit:cover;display:block}
.slab-pe{display:flex;justify-content:space-between;font-size:12px;color:var(--suave);padding:0 2px 2px}
.vazio-vivo{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.ao-vivo-ponto{width:9px;height:9px;border-radius:50%;background:var(--vivo);box-shadow:0 0 0 0 var(--vivo);animation:pulso 2s infinite}
@keyframes pulso{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--vivo) 60%,transparent)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.ao-vivo-ponto{animation:none}}

/* Números do dia: uma faixa só, sem caixas separadas */
.numeros{display:grid;grid-template-columns:repeat(3,1fr);background:var(--sup);border:1px solid var(--linha);border-radius:16px;margin-bottom:14px}
.numeros>*{padding:14px 12px;text-decoration:none;color:inherit;border-left:1px solid var(--linha);min-width:0}
.numeros>*:first-child{border-left:0}
.numeros small{display:block;font-size:12px;color:var(--suave);font-weight:500}
.numeros b{display:block;font-size:18px;font-weight:750;font-variation-settings:"wdth" 112;font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.numeros span{display:block;font-size:12px;color:var(--suave)}
.numeros.grande{grid-template-columns:1fr 1fr}
.numeros.grande>*:first-child{grid-column:1/-1;border-bottom:1px solid var(--linha)}
.numeros.grande>*:nth-child(2){border-left:0}
.numeros.grande>*:first-child b{font-size:30px}
.contadores{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.contadores a{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--sup);border:1px solid var(--linha);text-decoration:none;color:var(--texto);font-size:14px}
.contadores b{font-variant-numeric:tabular-nums}

.feed{list-style:none;margin:0;padding:0}
.feed li{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--linha)}
.feed li:last-child{border-bottom:0}
.feed img{width:36px;height:50px;object-fit:cover;border-radius:4px;grid-row:span 2;background:var(--sup2)}
.feed .quem{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.feed .valor{font-weight:750;font-variant-numeric:tabular-nums;text-align:right}
.feed .det{grid-column:2;font-size:13px;color:var(--suave)}
.feed .tempo{font-size:12px;color:var(--suave);text-align:right}
.feed a{text-decoration:none;font-weight:650}
.agenda li{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--linha);align-items:baseline}
.agenda li:last-child{border-bottom:0}
.agenda .h{font-weight:700;font-variant-numeric:tabular-nums;min-width:96px;flex:none}

/* Quadro do Início */
.quadro{display:flex;align-items:flex-start;gap:12px;overflow-x:auto;overflow-y:hidden;transition:height .2s ease;scroll-snap-type:x mandatory;margin:14px -16px 0;padding:0 16px 4px;scroll-padding:0 16px;scrollbar-width:none}
.quadro::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion:reduce){.quadro{transition:none}}
.coluna{container-type:inline-size;flex:none;width:min(272px,80vw);scroll-snap-align:start;background:var(--sup);border:1px solid var(--linha);border-top:3px solid var(--cor);border-radius:16px;padding:12px;display:flex;flex-direction:column}
.coluna-cab{display:flex;justify-content:space-between;align-items:center;gap:8px}
.k-item{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:8px;border-radius:12px;background:var(--sup2);margin-top:8px;text-decoration:none;color:var(--texto)}
.k-item img{width:34px;height:48px;border-radius:4px;object-fit:cover;display:block;background:var(--neutro-f)}
.k-item .t{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-sub{display:block;font-size:13px;color:var(--suave);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-item .v{font-weight:750;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.k-mais{text-align:center;margin:10px 0 0;font-size:13px;color:var(--suave)}
.k-vazio{padding:22px 8px;margin:0;text-align:center;color:var(--suave);font-size:14px}
.coluna .rodape{margin-top:auto;padding-top:12px;display:grid;gap:6px}
.coluna .rodape .botao,.coluna .rodape button{width:100%}
.k-lote{justify-content:space-between!important;min-height:40px;padding:8px 12px}
.quadro-pontos{display:flex;justify-content:center;gap:6px;margin:12px 0 2px}
.quadro-pontos i{width:6px;height:6px;border-radius:99px;background:var(--ponto);cursor:pointer;transition:width .2s,background .2s}
.quadro-pontos i.atual{width:18px;background:var(--texto)}
@container (max-width:232px){.k-item{grid-template-columns:34px 1fr}.k-item img{grid-row:span 2}.k-item .v{grid-column:2;font-size:13px}}
#enviar{scroll-margin-top:72px}

/* Lotes */
.lote-item{display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--linha)}
.lote-item:last-child{border-bottom:0}
.lote-item>.perigo{flex:none}
.perigo.largo{width:100%;justify-content:center}
.lote-linha{flex:1;min-width:0;display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;align-items:center;padding:12px 0;text-decoration:none;color:var(--texto)}
.pilha{display:flex;width:62px;height:62px;position:relative}
.pilha img,.pilha i{position:absolute;width:40px;height:56px;object-fit:cover;border-radius:4px;border:2px solid var(--sup);background:var(--neutro-f)}
.pilha>*:nth-child(1){left:0;top:6px;transform:rotate(-6deg)}.pilha>*:nth-child(2){left:11px;top:3px}.pilha>*:nth-child(3){left:22px;top:0;transform:rotate(6deg)}
.lote-linha b{font-size:16px}
.lote-linha .tot{font-weight:750;font-variant-numeric:tabular-nums;text-align:right}
.seg{display:flex;height:6px;border-radius:99px;overflow:hidden;background:var(--neutro-f);margin-top:6px}
.seg i{display:block}
.seg .neutro{background:var(--suave);opacity:.5}.seg .fila{background:var(--fila)}.seg .vivo{background:var(--vivo)}.seg .ok{background:var(--ok)}.seg .alerta{background:var(--alerta)}
.legenda{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px}

/* Cartas (edição) */
.cartas{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.carta{background:var(--sup);border:1px solid var(--linha);border-radius:16px;padding:10px;display:grid;grid-template-columns:96px 1fr;gap:10px}
.carta.marcada{border-color:var(--volt);box-shadow:inset 0 0 0 1px var(--volt)}
.carta .foto img{width:96px;height:134px;object-fit:cover;border-radius:8px;display:block;background:var(--sup2)}
.carta .cab{display:flex;align-items:center;gap:8px;justify-content:space-between}
.carta .cab label{margin:0;display:flex;gap:8px;align-items:center;color:var(--texto);font-weight:700}
.valores{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.valores label{margin:0 0 2px;font-size:12px}
.valores input{padding:8px 9px;font-variant-numeric:tabular-nums}
.carta .desc{grid-column:1/-1}
.carta .desc label{margin-top:0}
.carta .info{grid-column:1/-1;font-size:14px;display:grid;gap:3px}
.carta .ro{margin-top:6px}
.carta .ro .precos{font-size:13px;color:var(--suave);font-variant-numeric:tabular-nums;margin-top:2px}
.lider{font-weight:650}
.erro-carta{grid-column:1/-1;color:var(--alerta);font-size:13px}.erro-carta:empty{display:none}

/* Painel de ações e barra fixa */
.abas{display:flex;gap:4px;padding:4px;background:var(--sup2);border-radius:12px;margin-bottom:6px}
.abas button{flex:1;min-height:38px;padding:6px 8px;border:0;background:transparent;font-size:14px;color:var(--suave)}
.abas button.atual{background:var(--sup);color:var(--texto);box-shadow:0 0 0 1px var(--linha)}
.fixa{position:sticky;bottom:12px;z-index:4;display:flex;align-items:center;gap:8px;background:var(--sup2);border:1px solid var(--linha);border-radius:14px;padding:6px;margin-top:14px}
.fixa button{min-height:40px;padding:8px 14px}
.fixa .suave{flex:1;padding-left:4px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.arquivo input{display:none}
.envio-fotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.envio-fotos .botao{min-height:64px;flex-direction:column;gap:4px;font-size:14px}
details>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
details>summary::-webkit-details-marker{display:none}
details>summary::after{content:"";margin-left:auto;width:8px;height:8px;border-right:2px solid var(--suave);border-bottom:2px solid var(--suave);transform:rotate(45deg);transition:transform .15s}
details[open]>summary::after{transform:rotate(-135deg)}
details[open]>summary{margin-bottom:8px}

/* Relatórios */
.periodo{display:flex;gap:4px;padding:4px;background:var(--sup2);border-radius:12px;margin-bottom:14px}
.periodo a{flex:1;text-align:center;padding:8px 6px;border-radius:9px;color:var(--suave);text-decoration:none;font-size:14px;font-weight:600}
.periodo a.atual{background:var(--sup);color:var(--texto);box-shadow:0 0 0 1px var(--linha)}
.grafico svg{display:block;width:100%;height:auto;overflow:visible}
.grafico .barra-g{fill:var(--volt)}.grafico .alvo:hover+.barra-g{opacity:.75}
.grafico .grade{stroke:var(--linha);stroke-width:1}.grafico text{fill:var(--suave);font-size:20px;font-family:inherit}

/* Mais */
.lista-mais a{display:flex;align-items:center;gap:12px;padding:14px 4px;border-bottom:1px solid var(--linha);text-decoration:none;color:var(--texto);font-weight:600}
.lista-mais a:last-child{border-bottom:0}
.lista-mais a span{margin-left:auto;color:var(--suave);font-weight:500;font-size:14px}
.lista-mais svg{color:var(--suave)}
.grupos-escolha{display:flex;flex-wrap:wrap;gap:6px}
.gchk{display:inline-flex;align-items:center;gap:8px;margin:0;padding:8px 12px;border:1px solid var(--linha);border-radius:12px;background:var(--sup2);color:var(--texto);font-size:15px;font-weight:600;cursor:pointer}
.gchk input{width:18px;height:18px}
.gchk.off{opacity:.55;cursor:default}
.grupo-linha{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--linha)}
.grupo-linha:last-child{border-bottom:0}
.grupo-linha .acoes{grid-column:1/-1;margin:4px 0 0;display:flex;flex-wrap:wrap;gap:6px}
.grupo-linha .acoes button{min-height:36px;padding:6px 12px;font-size:14px}
.cmd{display:block;background:var(--sup2);border:1px solid var(--linha);border-radius:10px;padding:9px 12px;margin:6px 0 10px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-all;color:var(--texto)}
.passos{margin:8px 0 0;padding-left:20px}.passos li{margin:0 0 10px}
.voltar{display:inline-flex;align-items:center;gap:2px;margin:-6px 0 6px -6px;padding:4px 6px;color:var(--suave);text-decoration:none;font-weight:600;font-size:14px;border-radius:8px}
.saudacao{margin:0 0 2px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kpis b{display:block;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.trava{display:inline-flex;align-items:center;gap:4px}
.div-item{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--linha)}
.div-item:last-child{border-bottom:0}
.div-item img{width:56px;height:56px;object-fit:cover;border-radius:10px;background:var(--sup2)}
.div-item .sem-foto{width:56px;height:56px;border-radius:10px;display:grid;place-items:center;background:var(--sup2);color:var(--suave)}
.div-item p{margin:0;white-space:pre-line;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.div-item .acoes{margin-top:8px}
.div-item .acoes button{min-height:36px;padding:6px 12px;font-size:14px}
.hora-campos{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sub-mais{font-size:13px;font-weight:650;color:var(--suave);text-transform:uppercase;letter-spacing:.06em;margin:6px 4px 8px}
.equipe .pessoa i{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:750;color:#131418;background:linear-gradient(135deg,var(--volt),#c9a7ff)}
.equipe .pessoa b{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;font-weight:650}
.equipe .pessoa b small.suave{font-weight:500;font-size:13px}
.equipe .pessoa em{font-style:normal}
.equipe .pessoa small.selo{display:inline;font-size:11px;margin-left:6px;vertical-align:2px}
.chip{display:inline-block;padding:6px 12px;border-radius:99px;border:1px solid var(--linha);color:var(--suave);text-decoration:none;font-size:14px;font-weight:600}
.chip.atual{background:var(--sup2);color:var(--texto);border-color:var(--suave)}
.qr{background:#fff;padding:12px;border-radius:12px;display:inline-block}

@media (min-width:900px){
.quadro{display:grid;align-items:stretch;grid-template-columns:repeat(5,minmax(0,1fr));overflow:visible;margin:14px 0 0;padding:0}
main{max-width:1320px}
.coluna{width:auto}
.quadro-pontos,.so-celular{display:none}
body{padding-bottom:0;padding-left:280px}
.gaveta{width:280px;transform:none;visibility:visible;box-shadow:none;z-index:8}
.veu,.abrir-menu,.g-topo .fechar{display:none}
.topo-app .marca{visibility:hidden}
.fixa{bottom:12px}
h1{font-size:34px}
}
`

// Menu da gaveta, separado por área: [endereço, nome, ícone, contador].
const MENU = [
  ['Leilão', [['/', 'Início', 'inicio'], ['/lotes', 'Lotes', 'lotes', 'lotes'], ['/no-ar', 'Ao vivo', 'vivo', 'no_ar'], ['/sem-lance', 'Sem lance', 'semlance', 'sem_lance']]],
  ['Vendas', [['/vendas', 'Vendas', 'vendas', 'semRemessa'], ['/pagamentos', 'Pagamentos', 'cartao', 'pagamentos'], ['/remessas', 'Remessas', 'caminhao', 'separar'], ['/relatorios', 'Relatórios', 'relatorios']]],
  ['Grupos', [['/grupos', 'Grupos', 'grupos', 'grupos'], ['/divulgacao', 'Divulgação', 'megafone', 'divulgacao'], ['/links', 'Links', 'corrente', 'links']]],
  ['Proteção', [['/punicoes', 'Strikes e bloqueios', 'escudo', 'bloqueados'], ['/seguranca', 'Verificação de membros', 'lupa', 'risco']]],
  ['Sistema', [['/whatsapp', 'WhatsApp', 'whats', 'whats'], ['/usuarios', 'Usuários', 'usuario', 'online'], ['/atividade', 'Atividade', 'atividade', 'falhas'], ['/backup', 'Backup', 'backup', 'backup'], ['/config', 'Configurações', 'ajustes']]]
]
// Telas que ficam "dentro" de outra no menu (marca o item certo).
const MENU_PAI = { '/conexao': '/grupos' }

function contador (chave, m = {}) {
  const n = (v, cls = '', cont = '') => `<span class="n ${cls}${cont ? ' ponto' : ''}"${cont ? ` data-cont="${cont}"` : ''}${!v ? ' hidden' : ''}>${v || 0}</span>`
  switch (chave) {
    case 'lotes': return n(m.pendente, '', 'pendente')
    case 'no_ar': return n(m.no_ar, 'vivo', 'no_ar')
    case 'sem_lance': return n(m.sem_lance, 'alerta', 'sem_lance')
    case 'semRemessa': return n(m.semRemessa, 'fila')
    case 'pagamentos': return n(m.pagamentos, 'alerta')
    case 'separar': return n(m.separar, 'fila')
    case 'whats': return m.conectado ? '' : '<span class="txt ruim">desconectado</span>'
    case 'grupos': return n(m.gruposAtivos, 'ok')
    case 'divulgacao': return n(m.agendadas, 'fila')
    case 'links': return m.links ? '<span class="txt">ligado</span>' : ''
    case 'bloqueados': return n(m.bloqueados, 'alerta')
    case 'risco': return n(m.risco, 'alerta')
    case 'online': return n(m.online)
    case 'falhas': return n(m.falhas, 'alerta')
    case 'backup': return m.backup ? `<span class="txt${m.backup.ruim ? ' ruim' : ''}">${esc(m.backup.texto)}</span>` : ''
    default: return ''
  }
}

function gaveta (atual, m = {}) {
  if (atual.startsWith('/config')) atual = '/config'
  atual = MENU_PAI[atual] || atual
  const itens = MENU.map(([area, lista]) => `<div class="g-sec">${area}</div>` + lista.map(([h, t, i, k]) =>
    `<a class="g-item${atual === h ? ' atual' : ''}" href="${h}"${atual === h ? ' aria-current="page"' : ''}>${icone(i, 20)}${t}${k ? contador(k, m) : ''}</a>`).join('')).join('')
  return `<div class="veu" data-fechar-menu></div>
<aside class="gaveta" id="gaveta" aria-label="Menu">
<div class="g-topo"><a class="marca" href="/" aria-label="CartaDex, início"><i aria-hidden="true"></i><b>CartaDex</b></a><button type="button" class="fechar" data-fechar-menu aria-label="Fechar menu">${icone('x', 20)}</button></div>
<div class="g-status"><b id="g-whats" class="${m.conectado ? 'on' : 'off'}"><i></i>${m.conectado ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</b><span id="g-resumo">${m.gruposAtivos ?? 0} grupo${m.gruposAtivos === 1 ? '' : 's'} ativo${m.gruposAtivos === 1 ? '' : 's'}</span></div>
<nav class="g-corpo">${itens}</nav>
${m.usuario ? `<div class="g-pe"><span class="av">${esc(m.usuario.charAt(0))}</span><div style="line-height:1.25;min-width:0;flex:1"><b>${esc(m.usuario)}</b><br><span class="suave">online agora</span></div>
<form method="post" action="/sair" style="margin:0"><button class="g-sair" aria-label="Sair do painel" title="Sair">${icone('sair', 18)}<span>Sair</span></button></form></div>` : ''}
</aside>`
}
export function layout (titulo, corpo, { aba = '', msg = '', erro = '', semTitulo = false, voltar = null, menu = {}, dados = '' } = {}) {
  const atual = aba
  const [voltarPara, voltarTexto] = voltar || []
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(titulo)} · CartaDex</title>
<meta name="theme-color" content="#131418">
<style id="cdx-guarda">html{visibility:hidden!important;background:#131418}</style>
<script>(function(){
// O painel nasce invisível e só aparece com login confirmado. Ao sair da página ele se esconde de novo,
// então nenhuma cópia guardada pelo navegador (setas voltar/avançar) mostra o painel.
var h=document.documentElement,g=document.getElementById('cdx-guarda');
var ok=function(){return /(?:^|; )cdx_on=1(?:;|$)/.test(document.cookie)};
var esconder=function(){h.style.setProperty('visibility','hidden','important')};
var mostrar=function(){if(g&&g.parentNode)g.parentNode.removeChild(g);h.style.removeProperty('visibility')};
var fora=function(){esconder();location.replace('/entrar')};
if(ok())mostrar();else fora();
addEventListener('pagehide',esconder);
addEventListener('pageshow',function(e){if(!ok())fora();else if(e.persisted){esconder();location.reload()}else mostrar()});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&!ok())fora()});
})()</script>
<script>try{if(localStorage.getItem('tema')==='claro'){document.documentElement.dataset.tema='claro';document.querySelector('meta[name=theme-color]').content='#f3f3f6'}}catch(e){}</script>
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icone-192.png"><link rel="apple-touch-icon" href="/icone-192.png">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="CartaDex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body data-dados="${esc(dados)}">
<header class="topo-app"><button type="button" class="abrir-menu" data-abrir-menu aria-label="Abrir menu" aria-controls="gaveta">${icone('menu', 22)}</button><a class="marca" href="/" aria-label="CartaDex, início"><i aria-hidden="true"></i><b>CartaDex</b></a>
<div class="estado"><span class="grupo-nome" id="grupo-nome"></span><span class="pilula" id="pilula-fila" hidden></span><span class="pilula" id="pilula"><i></i><b id="pilula-txt">...</b></span>
<button type="button" class="tema" id="tema" role="switch" aria-checked="false" aria-label="Tema claro" title="Tema claro / escuro"><svg class="t-lua" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg><svg class="t-sol" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button></div></header>
${gaveta(atual, menu)}
<main>${msg ? `<div class="aviso">${esc(msg)}</div>` : ''}${erro ? `<div class="aviso erro">${esc(erro)}</div>` : ''}
${voltarPara ? `<a class="voltar" href="${voltarPara}">${icone('voltar', 18)}${esc(voltarTexto)}</a>` : ''}
${semTitulo ? '' : `<h1>${esc(titulo)}</h1>`}${corpo}</main>
<dialog class="janela" id="j-excluir"><form method="post" action="/excluir/remessas" autocomplete="off">
<div class="j-cab"><b>${icone('lixo', 18)} Excluir</b><button type="button" class="fechar" data-fechar-janela aria-label="Fechar">${icone('x', 18)}</button></div>
<p data-ex-texto style="margin:6px 0 0;font-weight:600"></p><div data-ex-campos></div><input type="hidden" name="voltar">
<label for="ex-senha">Sua senha do painel</label><input id="ex-senha" type="password" name="senha" autocomplete="current-password" required>
<p class="suave" style="margin:8px 2px 0">Antes de excluir, o bot faz um backup. Depois disso, só dá para recuperar restaurando esse backup.</p>
<div class="acoes"><button class="perigo" style="flex:1">Excluir</button></div></form></dialog>
<script>
(()=>{
addEventListener('pageshow',e=>{if(e.persisted)location.reload()});
const $$=s=>[...document.querySelectorAll(s)];
const bt=document.getElementById('tema');
if(bt){const marcar=()=>{const c=document.documentElement.dataset.tema==='claro';bt.setAttribute('aria-checked',c);document.querySelector('meta[name=theme-color]').content=c?'#f3f3f6':'#131418'};marcar();
bt.addEventListener('click',()=>{const c=document.documentElement.dataset.tema!=='claro';if(c)document.documentElement.dataset.tema='claro';else delete document.documentElement.dataset.tema;try{localStorage.setItem('tema',c?'claro':'escuro')}catch(e){}marcar()})}
function contarMarcadas(){const n=$$('input[name="sel"]:checked').length;$$('[data-marcadas]').forEach(e=>e.textContent=n?n+(n===1?' marcada':' marcadas'):e.dataset.marcadas);
$$('input[name="sel"]').forEach(c=>{const k=c.closest('.carta');if(k)k.classList.toggle('marcada',c.checked);const x=c.closest('.cx');if(x)x.classList.toggle('sel',c.checked)})}
$$('input[name="sel"]').forEach(c=>c.addEventListener('change',contarMarcadas));
$$('[data-todas]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();
const cx=$$('input[name="sel"]');const marcar=cx.some(c=>!c.checked&&!c.disabled);cx.forEach(c=>{if(!c.disabled)c.checked=marcar});contarMarcadas()}));
const abrir=()=>document.body.classList.add('menu-aberto'),fechar=()=>document.body.classList.remove('menu-aberto');
$$('[data-abrir-menu]').forEach(b=>b.addEventListener('click',abrir));$$('[data-fechar-menu]').forEach(b=>b.addEventListener('click',fechar));
addEventListener('keydown',e=>{if(e.key==='Escape')fechar()});$$('.g-item').forEach(a=>a.addEventListener('click',fechar));
$$('[data-confirma]').forEach(b=>b.addEventListener('click',e=>{if(!confirm(b.dataset.confirma))e.preventDefault()}));
$$('[data-aba]').forEach(b=>b.addEventListener('click',()=>{$$('[data-aba]').forEach(x=>{x.classList.toggle('atual',x===b);x.setAttribute('aria-selected',x===b)});
$$('[data-painel]').forEach(p=>p.hidden=p.dataset.painel!==b.dataset.aba)}));
$$('.arquivo input').forEach(i=>i.addEventListener('change',()=>{const n=$$('.arquivo input').reduce((s,x)=>s+x.files.length,0);
const e=document.getElementById('qtd-fotos');if(e)e.textContent=n?n+(n===1?' foto escolhida':' fotos escolhidas'):'Nenhuma foto escolhida';
const b=document.getElementById('enviar-fotos');if(b)b.disabled=!n}));

const jx=document.getElementById('j-excluir');
$$('[data-excluir]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();if(!jx)return;const f=jx.querySelector('form');f.action=b.dataset.excluir;
const box=jx.querySelector('[data-ex-campos]');box.textContent='';const add=(k,v)=>{const i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;box.appendChild(i)};
let campos={};try{campos=JSON.parse(b.dataset.exCampos||'{}')}catch(_){}Object.entries(campos).forEach(([k,v])=>add(k,v));
let n=0;if(b.hasAttribute('data-ex-marcadas')){const fm=b.closest('form');(fm?[...fm.querySelectorAll('input[name="sel"]:checked')]:[]).forEach(c=>{add('sel',c.value);n++});
if(!n){alert('Marque pelo menos uma carta.');return}}
jx.querySelector('[data-ex-texto]').textContent=(b.dataset.exTexto||'Excluir?').replace('{n}',n);f.querySelector('[name="voltar"]').value=location.pathname+location.search.replace(/[?&](msg|erro)=[^&]*/g,'');
const s=f.querySelector('[name="senha"]');s.value='';jx.showModal();s.focus()}));
const marcadas=()=>$$('input[name="sel"]:checked').filter(c=>c.closest('.form-lote'));
const textoAlvo=()=>{const b=document.querySelector('.barra-lote');const n=marcadas().length;return n?('Vale para '+n+(n===1?' carta marcada.':' cartas marcadas.')):('Nenhuma marcada: vale para todas desta aba ('+(b?b.dataset.total:0)+').')};
$$('[data-abrir-janela]').forEach(b=>b.addEventListener('click',()=>{const d=document.getElementById('j-'+b.dataset.abrirJanela);if(!d)return;$$('[data-alvo-texto]').forEach(e=>e.textContent=textoAlvo());d.showModal()}));
$$('[data-fechar-janela]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog.janela').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
$$('[data-precisa-marcar]').forEach(b=>b.addEventListener('click',e=>{if(!marcadas().length){e.preventDefault();e.stopImmediatePropagation();alert('Marque as cartas primeiro.')}},true));
const jc=document.getElementById('j-carta');
if(jc){const lista=()=>$$('.cx[data-editar]');let atual=null;
const abrirCarta=id=>{const el=document.getElementById('c'+id);if(!el)return;atual=el;const d=el.dataset;
jc.querySelector('[data-c="num"]').textContent='#'+d.num;jc.querySelector('[data-c="status"]').textContent=d.status;jc.querySelector('[data-c="foto"]').src=d.foto;
jc.querySelector('[data-c="excluir"]').value=d.editar;
jc.querySelectorAll('[data-campo]').forEach(i=>{const k=i.dataset.campo;i.name='c[k'+d.editar+']['+k+']';i.value=d[k==='descricao'?'desc':k]||''});
const l=lista(),i=l.indexOf(el);jc.querySelector('[data-ir="-1"]').disabled=i<=0;jc.querySelector('[data-ir="1"]').disabled=i>=l.length-1;
jc.querySelector('[data-salvar-proxima]').hidden=i>=l.length-1;
if(!jc.open)jc.showModal()};
$$('[data-abrir-carta]').forEach(b=>b.addEventListener('click',()=>abrirCarta(b.dataset.abrirCarta)));
jc.querySelectorAll('[data-ir]').forEach(b=>b.addEventListener('click',()=>{const l=lista(),i=l.indexOf(atual)+Number(b.dataset.ir);if(l[i])abrirCarta(l[i].dataset.editar)}));
jc.querySelector('[data-salvar-proxima]').addEventListener('click',()=>{const l=lista(),p=l[l.indexOf(atual)+1];jc.querySelector('[name="proxima"]').value=p?p.dataset.editar:''});
const auto=document.querySelector('[data-abrir-ao-carregar]');if(auto)abrirCarta(auto.dataset.abrirAoCarregar)}
const novas=document.querySelector('[data-valores-novas]');const jv=document.getElementById('j-valores');
if(novas&&jv){const[a,b]=novas.dataset.valoresNovas.split('-').map(Number);
$$('.form-lote input[name="sel"]').forEach(c=>{const v=Number(c.value);if(v>=a&&v<=b)c.checked=true});contarMarcadas();
$$('[data-alvo-texto]').forEach(e=>e.textContent=textoAlvo());jv.showModal();const f=jv.querySelector('input');if(f)f.focus()}
const ST=${JSON.stringify(STATUS)};
async function vivo(){try{
const ids=[...new Set($$('[data-selo],[data-lider],[data-lance],[data-lider-curto]').map(e=>e.dataset.selo||e.dataset.lider||e.dataset.lance||e.dataset.liderCurto))].join(',');
const r=await fetch('/api/status?ids='+ids,{cache:'no-store'});if(!r.ok)return;const s=await r.json();
if(s.dados&&document.body.dataset.dados&&s.dados!==document.body.dataset.dados)novidades();
const qd=document.querySelector('[data-contagem]');
if(qd){const ini=JSON.parse(qd.dataset.contagem);if(['pendente','fila','agendada','no_ar','vendida','sem_lance'].some(k=>(ini[k]||0)!==(s.cont[k]||0))){try{sessionStorage.setItem('quadroX',String(qd.scrollLeft))}catch(e){}location.reload();return}}
const gw=document.getElementById('g-whats');if(gw){gw.className=s.conectado?'on':'off';gw.lastChild.textContent=s.conectado?'WhatsApp conectado':'WhatsApp desconectado'}
const gr=document.getElementById('g-resumo');if(gr&&s.grupos){const at=s.grupos.ativos;gr.textContent=at+(at===1?' grupo ativo':' grupos ativos')+(s.fila?' · '+s.fila+' na fila':'')}
const p=document.getElementById('pilula');p.className='pilula '+(s.conectado?'on':'off');
document.getElementById('pilula-txt').textContent=s.conectado?'Conectado':'Desconectado';
const g=s.grupos||{};document.getElementById('grupo-nome').textContent=s.conectado?(!g.total?'Escolha os grupos':g.pausados?(g.ativos+' de '+g.total+' grupos ativos'):(g.total+(g.total===1?' grupo':' grupos'))):'';
const f=document.getElementById('pilula-fila');const ft=s.pausada?'Fila pausada':s.enviando?'Enviando #'+s.enviando:s.fila?s.fila+' na fila':'';
f.hidden=!ft;f.textContent=ft;f.className='pilula fila';document.getElementById('grupo-nome').hidden=!!ft&&innerWidth<520;
$$('[data-cont]').forEach(e=>{const v=e.dataset.cont.split(',').reduce((a,k)=>a+(s.cont[k]||0),0);e.textContent=v;if(e.classList.contains('ponto'))e.hidden=!v});
for(const c of s.cartas){
$$('[data-selo="'+c.id+'"]').forEach(e=>{const t=ST[c.status]||[c.status,'neutro'];e.textContent=t[0];e.className='selo '+t[1]});
$$('[data-lider="'+c.id+'"]').forEach(e=>{e.textContent=c.status==='no_ar'?(c.lider?c.lider+' está ganhando com '+c.valor:'Ainda sem lances'):''});
$$('[data-lance="'+c.id+'"]').forEach(e=>{if(c.status!=='no_ar')return;e.textContent=(e.hasAttribute('data-curto')?c.valorCurto:c.valor)||e.dataset.vazio||'Sem lance'});
$$('[data-quem="'+c.id+'"]').forEach(e=>{if(c.status==='no_ar')e.textContent=c.lider?c.lider+(c.arremate?', arremate':''):'Aguardando o primeiro'});
$$('[data-lider-curto="'+c.id+'"]').forEach(e=>{if(c.status==='no_ar')e.textContent=c.lider?c.lider+' · '+c.valor+(c.arremate?' ⚡':''):'sem lance ainda'});
$$('[data-votos="'+c.id+'"]').forEach(e=>{e.textContent=c.status==='no_ar'?(c.votos+(c.votos===1?' voto':' votos')):''});
$$('[data-erro="'+c.id+'"]').forEach(e=>{e.textContent=c.erro?'Erro no envio: '+c.erro:''});
}}catch(e){}}
const qd0=document.querySelector('.quadro');
if(qd0){try{const x=sessionStorage.getItem('quadroX');if(x!==null){qd0.scrollLeft=+x;sessionStorage.removeItem('quadroX')}}catch(e){}
const pts=$$('.quadro-pontos i');const passo=()=>{const c=qd0.querySelector('.coluna');return c?c.getBoundingClientRect().width+12:1};
const marcar=()=>{const cs=qd0.querySelectorAll('.coluna');const i=Math.min(cs.length-1,Math.round(qd0.scrollLeft/passo()));pts.forEach((p,k)=>p.classList.toggle('atual',k===i));if(innerWidth>=900){qd0.style.height='';return}const c=cs[i];if(c)qd0.style.height=(c.offsetHeight+6)+'px'};addEventListener('resize',marcar);
qd0.addEventListener('scroll',marcar,{passive:true});pts.forEach((p,k)=>p.addEventListener('click',()=>qd0.scrollTo({left:k*passo(),behavior:'smooth'})));marcar()}
// Dados novos (pagamento caiu, carta encerrou, remessa mudou...): a tela recarrega sozinha, no mesmo ponto da rolagem.
// Se a pessoa estiver mexendo em algo (digitando, com janela aberta, formulário alterado), não recarrega:
// mostra um botão "Atualizar" e espera.
let sujo=false,aviso=null;
document.addEventListener('input',e=>{if(e.target.closest('form'))sujo=true},true);
document.addEventListener('change',e=>{if(e.target.closest('form'))sujo=true},true);
let recente=false;try{recente=Date.now()-Number(sessionStorage.getItem('recarregou')||0)<4000}catch(e){}
const ocupado=()=>{const a=document.activeElement;return sujo||recente||!!document.querySelector('dialog[open]')||!!(a&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))};
const recarregar=()=>{try{sessionStorage.setItem('rolagem',location.pathname+'|'+Math.round(scrollY));sessionStorage.setItem('recarregou',String(Date.now()))}catch(e){}
const u=new URL(location.href);u.searchParams.delete('msg');u.searchParams.delete('erro');location.replace(u.pathname+u.search+u.hash)};
function novidades(){if(document.hidden)return;if(!ocupado()){recarregar();return}
if(aviso)return;aviso=document.createElement('button');aviso.type='button';aviso.className='novidades';aviso.textContent='Novidades no painel · Atualizar';
aviso.addEventListener('click',recarregar);document.body.appendChild(aviso)}
try{const r=(sessionStorage.getItem('rolagem')||'').split('|');sessionStorage.removeItem('rolagem');if(r[0]===location.pathname&&r[1])scrollTo(0,+r[1])}catch(e){}
// Tempo real: o bot avisa a tela quando algo muda, e ela busca as novidades na hora.
// Se o aviso não estiver funcionando, a tela confere sozinha (a cada 10 s pelo ngrok, 2 s nos outros endereços).
let fonte=null,ultimo=0;const buscar=()=>{ultimo=Date.now();vivo()};
if('EventSource' in window){try{fonte=new EventSource('/api/eventos');let t=null;fonte.onmessage=()=>{clearTimeout(t);t=setTimeout(()=>{if(!document.hidden)buscar()},120)}}catch(e){fonte=null}}
addEventListener('pagehide',()=>{if(fonte)fonte.close()});
const intervalo=/ngrok/.test(location.hostname)?10000:2000;
buscar();setInterval(()=>{if(document.hidden)return;const aoVivo=fonte&&fonte.readyState===1;if(!aoVivo||Date.now()-ultimo>30000)buscar()},intervalo);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)vivo()});
})()
</script></body></html>`
}

export const textoLider = l => `${nomeCurto(l.votante)}, ${moeda(l.valor)}${l.tipo === 'arremate' ? ' (arremate)' : ''}`

const EDITAVEL = ['pendente', 'agendada', 'sem_lance']
const foto = c => `/fotos/${encodeURIComponent(c.foto)}`

function cartaoCarta (c, { editar = true, lider = null, votos = 0 } = {}) {
  const pode = editar && EDITAVEL.includes(c.status)
  const campo = (k, rot) => `<div><label for="c${c.id}${k}">${rot}</label><input id="c${c.id}${k}" name="c[k${c.id}][${k}]" value="${esc(valorCampo(c[k]))}" inputmode="decimal" placeholder="0,00"></div>`
  const info = []
  if (c.status === 'agendada') info.push(`<span>Envio ${quando(c.enviar_em)}</span>`)
  if (['agendada', 'fila', 'no_ar'].includes(c.status) && c.encerra_em) info.push(`<span class="suave">Encerra ${quando(c.encerra_em)}</span>`)
  if (c.status === 'no_ar') {
    info.push(`<span class="lider" data-lider="${c.id}">${lider ? `${esc(nomeCurto(lider.votante))} está ganhando com ${moeda(lider.valor)}` : 'Ainda sem lances'}</span><span class="suave" data-votos="${c.id}">${votos} ${votos === 1 ? 'voto' : 'votos'}</span>`)
  }
  if (c.status === 'vendida') info.push(`<span class="lider">Vendida para ${esc(nomeCurto(c.vencedor))} por ${moeda(c.valor_venda)}${c.opcao_venda === 3 ? ' no arremate' : ''}</span>`)
  if (c.previa_em && ['pendente', 'agendada', 'fila'].includes(c.status)) info.push(`<span class="suave">Prévia postada ${quando(c.previa_em)}</span>`)
  if (c.envios > 1 || (c.envios === 1 && c.status === 'sem_lance')) info.push(`<span class="suave">Enviada ${c.envios} ${c.envios === 1 ? 'vez' : 'vezes'}</span>`)
  const precos = [c.v1, c.v2, c.v3].filter(Boolean).sort((x, y) => x - y).map(moeda)
  return `<div class="carta">
<a class="foto" href="${foto(c)}" target="_blank"><img src="${foto(c)}" loading="lazy" alt="Foto da carta ${numCarta(c)}"></a>
<div><div class="cab"><label><input type="checkbox" name="sel" value="${c.id}"> #${numCarta(c)}</label>${selo(c.status, c.id)}</div>
${pode
    ? `<div class="valores">${campo('v1', 'Lance 1')}${campo('v2', 'Lance 2')}${campo('v3', 'Lance 3')}${campo('arremate', 'Arremate')}</div>`
    : `<div class="ro"><div>${primeiraLinha(c.descricao) || '<span class="suave">Sem descrição</span>'}</div>
<div class="precos">${precos.join(', ')}${c.arremate ? `<br>Arremate ${moeda(c.arremate)}` : ''}</div></div>`}
</div>
${pode ? `<div class="desc"><label for="c${c.id}d">Descrição</label><textarea id="c${c.id}d" name="c[k${c.id}][descricao]" rows="1">${esc(c.descricao)}</textarea></div>` : ''}
${info.length ? `<div class="info">${info.join('')}</div>` : ''}
<div class="erro-carta" data-erro="${c.id}">${c.erro ? `Erro no envio: ${esc(c.erro)}` : ''}</div>
</div>`
}

const OPCOES_ENVIO = [['0', 'Agora'], ['10', 'Daqui a 10 min'], ['30', 'Daqui a 30 min'], ['60', 'Daqui a 1 hora'], ['120', 'Daqui a 2 horas'], ['data', 'Escolher dia e hora']]
const OPCOES_FIM = [['', 'Eu encerro manualmente'], ['30', '30 min depois do envio'], ['60', '1 hora depois'], ['120', '2 horas depois'], ['180', '3 horas depois'], ['360', '6 horas depois'], ['720', '12 horas depois'], ['1440', '24 horas depois'], ['data', 'Escolher dia e hora']]

// Caixinhas para escolher os grupos de um envio. Pausados aparecem, mas não dá para marcar.
function escolhaGrupos (nome, grupos = [], titulo = 'Enviar para') {
  if (!grupos.length) return `<label>${titulo}</label><p class="aviso erro" style="margin:0">Nenhum grupo escolhido. <a href="/grupos">Escolher grupos</a></p>`
  return `<label>${titulo}</label><div class="grupos-escolha"><input type="hidden" name="${nome}" value="-">
${grupos.map(g => `<label class="gchk${g.pausado ? ' off' : ''}"><input type="checkbox" name="${nome}" value="${esc(g.jid)}"${g.pausado ? ' disabled' : ' checked'}><span>${esc(g.nome || 'Grupo sem nome')}</span>${g.pausado ? '<small class="selo alerta">pausado</small>' : ''}</label>`).join('')}</div>`
}

function camposEnvio (grupos) {
  const sel = (nome, ops) => `<select id="${nome}" name="${nome}" onchange="this.parentNode.querySelector('.custom').style.display=this.value==='data'?'grid':'none'">${ops.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`
  const custom = p => `<div class="custom" style="display:none;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
<input name="${p}_dia" inputmode="numeric" placeholder="Dia: 25/10" autocomplete="off" aria-label="Dia"><input name="${p}_hora" inputmode="numeric" placeholder="Hora: 19:30" autocomplete="off" aria-label="Hora"></div>`
  return `${grupos ? escolhaGrupos('destino', grupos) : ''}<div class="linha">
<div><label for="enviar_modo">Quando enviar</label>${sel('enviar_modo', OPCOES_ENVIO)}${custom('enviar')}</div>
<div><label for="encerrar_modo">Quando encerrar</label>${sel('encerrar_modo', OPCOES_FIM)}${custom('encerrar')}</div></div>`
}

// Lê os campos de envio/encerramento do formulário e devolve horários em milissegundos.
export function lerHorarios (b, agora = Date.now()) {
  const diaHora = (dia, hora) => {
    const d = String(dia || '').match(/(\d{1,2})\D+(\d{1,2})(?:\D+(\d{2,4}))?/)
    if (!d) return null
    const h = String(hora || '').match(/^\s*(\d{1,2})(?:\D*(\d{2}))?/) || []
    let ano = d[3] ? Number(d[3]) : new Date(agora).getFullYear()
    if (ano < 100) ano += 2000
    const t = new Date(ano, Number(d[2]) - 1, Number(d[1]), Number(h[1] || 0), Number(h[2] || 0))
    if (!d[3] && t.getTime() < agora - 86_400_000) t.setFullYear(ano + 1)
    return Number.isFinite(t.getTime()) ? t.getTime() : null
  }
  let enviarEm = null
  if (b.enviar_modo === 'data') enviarEm = diaHora(b.enviar_dia, b.enviar_hora)
  else if (Number(b.enviar_modo) > 0) enviarEm = agora + Number(b.enviar_modo) * 60_000
  let encerraEm = null
  if (b.encerrar_modo === 'data') encerraEm = diaHora(b.encerrar_dia, b.encerrar_hora)
  else if (Number(b.encerrar_modo) > 0) encerraEm = Math.max(agora, enviarEm || 0) + Number(b.encerrar_modo) * 60_000
  return { enviarEm, encerraEm }
}

// Valor sem centavos quando for redondo: R$ 60 em vez de R$ 60,00.
export const reaisCurto = v => {
  if (v === null || v === undefined || v === '') return ''
  return v % 100 === 0 ? 'R$ ' + (v / 100).toLocaleString('pt-BR') : moeda(v)
}

// ---------- Início: quadro com uma coluna por etapa ----------
const LIMITE_COLUNA = 6

function itemQuadro (c, sub, valor = '', { aoVivo = false } = {}) {
  return `<a class="k-item" href="/lotes/${c.lote_id}">
<img src="${foto(c)}" alt="" loading="lazy">
<span style="min-width:0"><b class="t">#${numCarta(c)} ${primeiraLinha(c.descricao)}</b><span class="k-sub"${aoVivo ? ` data-quem="${c.id}"` : ''}>${sub}</span></span>
<span class="v"${aoVivo ? ` data-lance="${c.id}" data-curto data-vazio="—"` : ''}>${valor}</span></a>`
}

function colunaQuadro (titulo, cor, itens, rodape, vazio) {
  const total = itens.length
  const resto = total - LIMITE_COLUNA
  const corpo = total
    ? itens.slice(0, LIMITE_COLUNA).join('') + (resto > 0 ? `<p class="k-mais">e mais ${resto} ${resto === 1 ? 'carta' : 'cartas'}</p>` : '')
    : `<p class="k-vazio">${vazio}</p>`
  return `<section class="coluna" style="--cor:${cor}" aria-label="${titulo}">
<div class="coluna-cab"><b>${titulo}</b><span class="selo neutro num">${total}</span></div>
${corpo}
${rodape ? `<div class="rodape">${rodape}</div>` : ''}</section>`
}

// Avisos importantes (aparecem no Início e no Quadro).
export function avisosGerais ({ conectado, grupos = [], backupFalhou = '', erros = [] }) {
  const avisos = []
  if (!conectado) avisos.push('<div class="aviso erro">O WhatsApp está desconectado. <a href="/whatsapp">Conectar agora</a></div>')
  else if (!grupos.length) avisos.push('<div class="aviso erro">Nenhum grupo escolhido para o leilão. <a href="/grupos">Escolher grupos</a></div>')
  else if (!grupos.some(g => !g.pausado)) avisos.push('<div class="aviso erro">Todos os grupos estão pausados, então nada é enviado. <a href="/grupos">Ver grupos</a></div>')
  if (backupFalhou) avisos.push(`<div class="aviso erro">O último backup falhou: ${esc(backupFalhou)}. <a href="/backup">Ver backup</a></div>`)
  if (erros.length) avisos.push(`<div class="aviso erro">${erros.length === 1 ? 'Uma carta não foi enviada' : `${erros.length} cartas não foram enviadas`}: ${erros.map(e => `<a href="/lotes/${e.lote_id}">${esc(e.lote)} #${numCarta(e)}</a>`).join(', ')}. ${esc(erros[0].erro)}</div>`)
  return avisos
}

export function paginaQuadro ({ conectado, grupos = [], backupFalhou = '', pausada, erros, cont, enviandoId, pendentes, lotesPendentes, fila, noAr, vendidas, semLance, resumo }) {
  const avisos = avisosGerais({ conectado, grupos, backupFalhou, erros })

  // Para enviar
  const temValores = c => c.v1 && c.v2 && c.v3 && c.arremate
  const itensPendentes = pendentes.map(c => itemQuadro(c, esc(c.lote),
    temValores(c) ? `⚡ ${reaisCurto(c.arremate)}` : '<span style="color:var(--alerta)">falta valor</span>'))
  let rodapePendentes
  if (lotesPendentes.length === 1) {
    const l = lotesPendentes[0]
    rodapePendentes = `<a class="botao prim" href="/lotes/${l.lote_id}#enviar">Enviar ${l.n} ${l.n === 1 ? 'carta' : 'cartas'}</a>`
  } else if (lotesPendentes.length > 1) {
    rodapePendentes = '<p class="suave" style="margin:0 0 6px">Enviar por lote:</p>' + lotesPendentes.map(l =>
      `<a class="botao k-lote" href="/lotes/${l.lote_id}#enviar"><span>${esc(l.nome)}</span><span class="num">${l.n}</span></a>`).join('')
  } else {
    rodapePendentes = '<a class="botao" href="/lotes">Cadastrar cartas</a>'
  }

  // Na fila
  let posicao = 0
  const itensFila = fila.map(c => {
    let sub
    if (c.id === enviandoId) sub = '<span style="color:var(--fila);font-weight:650">saindo agora</span>'
    else if (c.status === 'agendada') sub = `envio ${quando(c.enviar_em)}`
    else { posicao++; sub = `${posicao}º na fila` }
    return itemQuadro(c, sub, '')
  })
  const rodapeFila = pausada
    ? '<form method="post" action="/fila/retomar"><button class="prim">Retomar fila</button></form>'
    : (fila.length ? '<form method="post" action="/fila/pausar"><button>Pausar fila</button></form>' : '')

  // Ao vivo
  const itensVivo = noAr.map(c => itemQuadro(c,
    c.lider ? esc(nomeCurto(c.lider.votante)) + (c.lider.tipo === 'arremate' ? ', arremate' : '') : 'Aguardando o primeiro',
    c.lider ? reaisCurto(c.lider.valor) : '—', { aoVivo: true }))

  // Vendidas (ainda sem remessa)
  const itensVendidas = vendidas.map(c => itemQuadro(c, esc(nomeCurto(c.vencedor)), (c.opcao_venda === 3 ? '⚡ ' : '') + reaisCurto(c.valor_venda)))

  // Sem lance
  const itensSem = semLance.map(c => itemQuadro(c, esc(c.lote), ''))

  const colunas = [
    colunaQuadro('Para enviar', 'var(--apagado)', itensPendentes, rodapePendentes, 'Nenhuma carta esperando envio.'),
    colunaQuadro('Na fila', 'var(--fila)', itensFila, rodapeFila, pausada ? 'A fila está pausada.' : 'Nada na fila.'),
    colunaQuadro('Ao vivo', 'var(--vivo)', itensVivo, noAr.length ? '<a class="botao" href="/no-ar">Ver lances</a>' : '', 'Nenhuma carta ao vivo.'),
    colunaQuadro('Vendidas', 'var(--ok)', itensVendidas, vendidas.length ? '<a class="botao" href="/vendas">Criar remessas</a>' : '', 'Nenhuma venda esperando remessa.'),
    colunaQuadro('Sem lance', 'var(--alerta)', itensSem, semLance.length ? '<a class="botao" href="/sem-lance">Reenviar</a>' : '', 'Nenhuma carta sem lance.')
  ]

  const taxa = resumo.taxa === null ? '—' : `${Math.round(resumo.taxa * 100)}%`
  return `${avisos.join('')}
<h1>Quadro</h1><p class="suave so-celular" style="margin:-10px 0 0">Cada coluna é uma etapa. Deslize para o lado para ver as outras.</p>
<div class="quadro" data-contagem='${JSON.stringify(cont)}'>${colunas.join('')}</div>
<div class="quadro-pontos" aria-hidden="true">${'<i></i>'.repeat(colunas.length)}</div>
<h2>Hoje</h2>
<div class="numeros">
<a href="/relatorios?periodo=7"><small>Vendido</small><b>${reais(resumo.hoje.t)}</b><span>${resumo.hoje.n} ${resumo.hoje.n === 1 ? 'carta' : 'cartas'}</span></a>
<a href="/vendas"><small>A receber</small><b>${reais(resumo.aReceber)}</b><span>não pago</span></a>
<a href="/relatorios?periodo=7"><small>Vendem</small><b>${taxa}</b><span>em 7 dias</span></a>
</div>`
}

// Seletor de horário (hora e minutos em listas, que funcionam em qualquer celular).
function campoHora (nome, valor, rotulo) {
  const [h, m] = String(valor || '00:00').split(':').map(Number)
  const minutos = [...new Set([0, 15, 30, 45, m || 0])].sort((a, b) => a - b)
  const dois = n => String(n).padStart(2, '0')
  return `<div><label>${rotulo}</label><div class="hora-campos">
<select name="${nome}_h" aria-label="${rotulo}, hora">${Array.from({ length: 24 }, (_, i) => `<option value="${i}"${i === h ? ' selected' : ''}>${dois(i)}h</option>`).join('')}</select>
<select name="${nome}_m" aria-label="${rotulo}, minutos">${minutos.map(i => `<option value="${i}"${i === m ? ' selected' : ''}>:${dois(i)}</option>`).join('')}</select></div></div>`
}

// ---------- WhatsApp (conexão) ----------
export function paginaWhatsapp ({ conectado, eu, qrImg, ultimoErro, grupos = 0 }) {
  let corpo = '<div class="bloco">'
  if (conectado) corpo += `<span class="pilula on"><i></i>Conectado</span> <span style="margin-left:6px">Número do bot: <b>+${esc(eu.split('@')[0])}</b></span>
<p class="suave" style="margin:10px 0 0">O bot está em ${grupos} grupo(s) do WhatsApp. Escolha quais recebem as cartas em <a href="/grupos">Grupos</a>.</p>`
  else if (qrImg) {
    corpo += `<p style="margin-top:0">No celular do número do bot, abra o WhatsApp, toque em <b>Aparelhos conectados</b>, depois em <b>Conectar um aparelho</b>, e escaneie:</p>
<div class="qr"><img src="${qrImg}" width="260" height="260" alt="QR code para conectar o WhatsApp"></div><p class="suave">O código muda a cada 20 segundos e a página se atualiza sozinha.</p>
<script>setTimeout(()=>location.reload(),15000)</script>`
  } else corpo += `Conectando ao WhatsApp. <span class="suave">${esc(ultimoErro)}</span><script>setTimeout(()=>location.reload(),4000)</script>`
  return corpo + '</div>'
}

// ---------- Grupos ----------
export function paginaGrupos ({ conectado, grupos, doBot = [], aoVivo = {}, c = {} }) {
  let corpo = conectado ? '' : '<div class="aviso erro">O WhatsApp está desconectado. <a href="/whatsapp">Conectar</a></div>'

  // Grupos que recebem as cartas.
  const noWhats = new Map(grupos.map(g => [g.id, g]))
  const botao = (acao, jid, texto, extra = '') => `<form method="post" action="/conexao/grupo/${acao}" style="display:inline"><input type="hidden" name="id" value="${esc(jid)}"><button${extra}>${texto}</button></form>`
  const trava = w => !w ? '' : w.fechado
    ? `<span class="selo fila trava">${icone('cadeado', 13)}Só admins</span>`
    : `<span class="selo neutro trava">${icone('aberto', 13)}Aberto</span>`
  corpo += `<h2>Grupos do leilão</h2><div class="bloco" style="padding-top:4px;padding-bottom:4px">${doBot.length
    ? doBot.map(g => {
      const w = noWhats.get(g.jid)
      const info = [w ? `${w.membros} membros` : (conectado ? 'o bot não está mais neste grupo' : ''), aoVivo[g.jid] ? `${aoVivo[g.jid]} ao vivo` : '',
        w && !w.souAdmin ? '<span style="color:var(--alerta)">o bot não é administrador</span>' : ''].filter(Boolean).join(' · ')
      return `<div class="grupo-linha"><div style="min-width:0"><b>${esc(g.nome || 'Grupo sem nome')}</b><br><span class="suave">${info}</span></div>
<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${trava(w)}<span class="selo ${g.pausado ? 'alerta' : 'ok'}">${g.pausado ? 'Pausado' : 'Ativo'}</span></span>
<div class="acoes">${g.pausado ? botao('retomar', g.jid, 'Retomar envios', ' class="prim"') : botao('pausar', g.jid, 'Pausar envios')}
${w && w.souAdmin ? (w.fechado ? botao('abrir', g.jid, `${icone('aberto', 17)}Abrir`) : botao('fechar', g.jid, `${icone('cadeado', 17)}Fechar`)) : ''}
${botao('remover', g.jid, 'Remover', ` data-confirma="Parar de usar ${esc(g.nome || 'este grupo')} no leilão? O bot continua no grupo do WhatsApp."`)}
${w ? botao('sair', g.jid, 'Sair do grupo', ` class="perigo" data-confirma="O número do bot vai SAIR de ${esc(g.nome || 'este grupo')} no WhatsApp. Para voltar, alguém precisa adicionar o bot de novo. Continuar?"`) : ''}</div></div>`
    }).join('')
    : '<p class="suave">Nenhum grupo escolhido ainda. Adicione abaixo os grupos que vão receber as cartas.</p>'}</div>
<p class="suave" style="margin:-4px 4px 0;font-size:13px"><b>Pausar envios:</b> o grupo não recebe cartas nem divulgação, mas o que já está lá continua recebendo lances. <b>Fechar:</b> só administradores mandam mensagem no grupo.</p>`

  // Fechar e abrir: todos de uma vez e no horário.
  const fechados = doBot.filter(g => noWhats.get(g.jid)?.fechado).length
  corpo += `<h2>Fechar e abrir os grupos</h2><div class="bloco">
<p style="margin:0">Fechado, só os administradores mandam mensagem. ${doBot.length ? `<span class="suave">Agora: ${fechados ? `${fechados} de ${doBot.length} fechado${fechados === 1 ? '' : 's'}` : 'todos abertos'}.</span>` : ''}</p>
<div class="acoes"><form method="post" action="/conexao/fechar-todos" style="display:inline"><button data-confirma="Fechar todos os grupos do leilão? Só os administradores vão poder mandar mensagem.">${icone('cadeado', 18)}Fechar todos</button></form>
<form method="post" action="/conexao/abrir-todos" style="display:inline"><button>${icone('aberto', 18)}Abrir todos</button></form></div>
<p class="aviso" style="margin:14px 0 0">Antes de fechar um grupo durante o leilão, teste com uma carta se o pessoal consegue votar na enquete com o grupo fechado.</p>
<p style="margin:12px 0 0">${c.horario_ativo === '1' ? `<span class="selo ok">Automático</span> fecha às <b>${esc(c.horario_fechar)}</b> e abre às <b>${esc(c.horario_abrir)}</b>` : '<span class="selo neutro">Automático desligado</span>'} <a href="/config/grupos">Ajustes ›</a></p></div>`

  if (conectado) {
    const outros = grupos.filter(g => !doBot.some(d => d.jid === g.id))
    corpo += `<h2>Outros grupos do bot</h2><div class="bloco" style="padding-top:4px;padding-bottom:4px">${outros.length
      ? `<form method="post" action="/conexao/grupo">${outros.map(g => `<div class="grupo-linha">
<label style="display:flex;gap:10px;align-items:center;margin:0;color:var(--texto);font-size:15px;min-width:0"><input type="checkbox" name="id" value="${esc(g.id + '|' + g.nome)}"><span style="min-width:0"><b>${esc(g.nome)}</b><br><span class="suave">${g.membros} membros${g.souAdmin ? ' · bot é admin' : ''}</span></span></label>
<button name="sair_id" value="${esc(g.id + '|' + g.nome)}" formaction="/conexao/grupo/sair" class="perigo" style="min-height:36px;padding:6px 12px;font-size:14px" data-confirma="O número do bot vai SAIR de ${esc(g.nome)} no WhatsApp. Continuar?">Sair</button></div>`).join('')}
<div class="acoes"><button class="prim">Adicionar marcados ao leilão</button></div></form>`
      : `<p class="suave">${grupos.length ? 'Todos os grupos do bot já estão no leilão.' : 'O número do bot não está em nenhum grupo. Adicione o bot ao grupo e recarregue a página.'}</p>`}</div>`
  }
  return corpo
}

// ---------- Divulgação ----------
const REPETE = { '': '', diario: 'todo dia', semanal: 'toda semana' }

function itemDivulgacao (d, enviada = false) {
  const thumb = d.foto ? `<img src="/fotos/${encodeURIComponent(d.foto)}" alt="" loading="lazy">` : `<span class="sem-foto">${icone('megafone', 22)}</span>`
  const quandoTxt = enviada
    ? `${d.status === 'erro' ? '<b style="color:var(--alerta)">não saiu</b>' : 'enviada'} ${quando(d.ultimo_envio || d.criada_em)}`
    : (d.status === 'enviando' ? 'enviando agora...' : quando(d.proximo_em))
  const meta = [quandoTxt, esc(d.destinoTxt || ''), REPETE[d.repetir] ? `<span class="selo fila">${REPETE[d.repetir]}</span>` : '', d.envios > 1 ? `${d.envios} envios` : '', d.criada_por ? `por ${esc(d.criada_por)}` : ''].filter(Boolean).join(' · ')
  const acao = (rota, texto, extra = '') => `<form method="post" action="/divulgacao/${d.id}/${rota}" style="display:inline"><button${extra}>${texto}</button></form>`
  return `<div class="div-item">${thumb}<div style="min-width:0"><p>${esc(d.texto) || '<span class="suave">(só a foto)</span>'}</p>
<div class="suave" style="margin-top:4px">${meta}</div>${d.erro ? `<div class="suave" style="color:var(--alerta);margin-top:2px">${esc(d.erro)}</div>` : ''}
<div class="acoes">${d.status === 'enviando' ? '' : acao('enviar', enviada ? 'Enviar de novo' : 'Enviar agora')}${acao('apagar', d.repetir && !enviada ? 'Parar e apagar' : 'Apagar', ' class="perigo" data-confirma="Apagar esta divulgação?"')}</div></div></div>`
}

export function paginaDivulgacao ({ grupos = [], agendadas = [], enviadas = [] }) {
  const ops = OPCOES_ENVIO.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
  return `<form method="post" action="/divulgacao" enctype="multipart/form-data" class="bloco">
<label for="d-texto" style="margin-top:0">Mensagem</label>
<textarea id="d-texto" name="texto" rows="4" placeholder="Ex.: 🔥 Hoje às 20h tem leilão de cartas raras! Chama os amigos."></textarea>
<div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">
<label class="botao arquivo" style="margin:0">${icone('galeria')}Foto (opcional)<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" onchange="this.closest('form').querySelector('[data-foto]').textContent=this.files[0]?this.files[0].name:'Nenhuma foto'"></label>
<span class="suave" data-foto>Nenhuma foto</span></div>
${escolhaGrupos('destino', grupos)}
<div class="linha">
<div><label for="enviar_modo">Quando</label><select id="enviar_modo" name="enviar_modo" onchange="this.parentNode.querySelector('.custom').style.display=this.value==='data'?'grid':'none';document.getElementById('d-botao').textContent=this.value==='0'?'Enviar agora':'Agendar'">${ops}</select>
<div class="custom" style="display:none;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px"><input name="enviar_dia" inputmode="numeric" placeholder="Dia: 25/10" autocomplete="off" aria-label="Dia"><input name="enviar_hora" inputmode="numeric" placeholder="Hora: 19:30" autocomplete="off" aria-label="Hora"></div></div>
<div><label for="d-rep">Repetir</label><select id="d-rep" name="repetir"><option value="">Não repetir</option><option value="diario">Todo dia</option><option value="semanal">Toda semana</option></select></div></div>
<div class="acoes"><button class="prim" id="d-botao">Enviar agora</button></div>
</form>

<h2>Agendadas${agendadas.length ? ` <small>${agendadas.length}</small>` : ''}</h2>
<div class="bloco" style="padding-top:4px;padding-bottom:4px">${agendadas.length ? agendadas.map(d => itemDivulgacao(d)).join('') : '<p class="suave">Nenhuma divulgação agendada.</p>'}</div>

<h2>Enviadas</h2>
<div class="bloco" style="padding-top:4px;padding-bottom:4px">${enviadas.length ? enviadas.map(d => itemDivulgacao(d, true)).join('') : '<p class="suave">Nada enviado ainda.</p>'}</div>

<p class="suave" style="margin:10px 4px 0">O link da loja, que sai sozinho nos grupos, fica em <a href="/links">Links</a>.</p>`
}

// ---------- Strikes e bloqueios ----------
export function paginaPunicoes ({ bloqueados = [], comStrike = [], c = {}, nome = j => j, carta = () => '' }) {
  const limite = Number(c.strikes_limite) || 3
  const bt = (rota, votante, texto, extra = '') => `<form method="post" action="/punicoes/${rota}" style="display:inline"><input type="hidden" name="votante" value="${esc(votante)}"><button${extra}>${texto}</button></form>`
  const regra = c.strikes_ativo === '1'
    ? `Tirar o lance depois de <b>${esc(c.strikes_minutos)} min</b> dá 1 strike (trocar de lance não dá). Com <b>${limite} strikes</b>, a pessoa é bloqueada e os votos dela deixam de valer até você desbloquear.`
    : 'Os strikes estão <b>desligados</b>: ninguém leva strike por tirar o lance.'
  return `<div class="aviso">${regra} <a href="/config/strikes">Ajustes ›</a></div>
<h2>Bloqueados <small>${bloqueados.length}</small></h2>
<div class="bloco" style="padding-top:4px;padding-bottom:4px">${bloqueados.length ? bloqueados.map(b => `<div class="grupo-linha">
<div style="min-width:0"><b>${esc(nome(b.votante))}</b><br><span class="suave">bloqueado ${haQuanto(b.desde)} · ${esc(b.motivo || '')}${b.por && b.por !== 'CartaDex' ? ` · por ${esc(b.por)}` : ''}</span></div>
<span class="selo alerta">Bloqueado</span>
<div class="acoes">${bt('desbloquear', b.votante, 'Desbloquear', ' class="prim" data-confirma="Desbloquear? Os votos voltam a valer e os strikes são zerados."')}</div></div>`).join('')
    : '<p class="suave">Ninguém bloqueado.</p>'}</div>
<h2>Com strike <small>${comStrike.length}</small></h2>
<div class="bloco" style="padding-top:4px;padding-bottom:4px">${comStrike.length ? comStrike.map(p => `<div class="grupo-linha">
<div style="min-width:0"><b>${esc(nome(p.votante))}</b><br><span class="suave">último ${haQuanto(p.ultimo)} · ${esc(p.motivo || '')}${p.carta_id ? ` · ${esc(carta(p.carta_id))}` : ''}</span></div>
<span class="selo ${p.n >= limite - 1 ? 'alerta' : 'fila'}">${p.n} de ${limite}</span>
<div class="acoes">${bt('tirar', p.votante, 'Tirar 1 strike')}${bt('zerar', p.votante, 'Zerar')}${bt('bloquear', p.votante, 'Bloquear agora', ' class="perigo" data-confirma="Bloquear esta pessoa? Os votos dela deixam de valer."')}</div></div>`).join('')
    : '<p class="suave">Ninguém com strike.</p>'}</div>
<h2>Bloquear um número</h2>
<form method="post" action="/punicoes/bloquear" class="bloco"><label for="p-num" style="margin-top:0">Número com DDD</label>
<div style="display:flex;gap:8px"><input id="p-num" name="telefone" inputmode="tel" placeholder="Ex.: 47 99999-0000"><button class="perigo" data-confirma="Bloquear este número?">Bloquear</button></div>
<p class="suave" style="margin:6px 0 0">Em alguns grupos o WhatsApp esconde o número de quem vota. Se o bloqueio por número não pegar, bloqueie pela lista acima depois que a pessoa levar um strike.</p></form>`
}

// ---------- Verificação de membros ----------
export function paginaSeguranca ({ alto = [], atencao = [], confiaveis = [], total = 0, escondidos = 0, ultima = null, nomeGrupo = j => j }) {
  const form = (rota, campos, texto, extra = '') => `<form method="post" action="/seguranca/${rota}" style="display:inline">${Object.entries(campos).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}<button${extra}>${texto}</button></form>`
  const quem = m => m.nome ? `${esc(m.nome)}${m.telefone ? ` <span class="suave">+${esc(m.telefone)}</span>` : ''}` : (m.telefone ? `+${esc(m.telefone)}` : '<span class="suave">número escondido</span>')
  const pessoa = m => `<div class="grupo-linha">
<div style="min-width:0"><b>${quem(m)}</b><br><span class="suave">${m.grupos.map(g => esc(nomeGrupo(g.jid))).join(', ')}</span></div>
<span class="selo ${m.nivel === 'alto' ? 'alerta' : 'fila'}">${m.nivel === 'alto' ? 'Alto risco' : 'Atenção'}</span>
<ul style="grid-column:1/-1;margin:2px 0 0;padding-left:18px;color:var(--suave);font-size:13px">${m.motivos.map(t => `<li>${esc(t)}</li>`).join('')}${m.ultimoSpam ? `<li>última mensagem suspeita: “${esc(m.ultimoSpam.trecho)}”</li>` : ''}</ul>
<div class="acoes">${m.grupos.map(g => form('remover', { grupo: g.jid, id_wa: g.id_wa, jid: m.jid }, m.grupos.length > 1 ? `Remover de ${esc(nomeGrupo(g.jid))}` : 'Remover do grupo', ` class="perigo" data-confirma="Remover esta pessoa de ${esc(nomeGrupo(g.jid))}? O bot precisa ser administrador."`)).join('')}
${m.bloqueado ? '' : form('bloquear', { jid: m.jid }, 'Bloquear votos')}${form('confiavel', { jid: m.jid }, 'É confiável')}</div></div>`
  const lista = (titulo, itens, vazio) => `<h2>${titulo} <small>${itens.length}</small></h2><div class="bloco" style="padding-top:4px;padding-bottom:4px">${itens.length ? itens.map(pessoa).join('') : `<p class="suave">${vazio}</p>`}</div>`
  return `<div class="bloco">
<p style="margin:0">O bot lê os membros dos grupos do leilão e procura sinais de golpe ou spam: número de fora do Brasil, DDD que não existe, link ou propaganda mandados no grupo, nome suspeito, quem acabou de entrar, bloqueados e quem tem strike.</p>
<p class="suave" style="margin:8px 0 0">São sinais, não prova: não existe uma lista pública de golpistas. Confira antes de remover alguém.</p>
<form method="post" action="/seguranca/verificar" class="acoes"><button class="prim">${icone('lupa', 18)}Verificar agora</button></form>
<p class="suave" style="margin:8px 0 0">${ultima ? `Última verificação ${haQuanto(ultima)} · ${total} membro(s)${escondidos ? ` · ${escondidos} com número escondido pelo WhatsApp` : ''}. O bot verifica sozinho uma vez por dia e avisa na Atividade quando entra alguém de alto risco.` : 'Ainda não foi verificado.'}</p></div>
${lista('Alto risco', alto, ultima ? 'Ninguém de alto risco.' : 'Toque em Verificar agora.')}
${lista('Atenção', atencao, ultima ? 'Ninguém para atenção.' : 'Toque em Verificar agora.')}
${confiaveis.length ? `<details class="bloco"><summary><b>Confiáveis</b><span class="suave">${confiaveis.length}</span></summary>${confiaveis.map(m => `<div class="grupo-linha"><div><b>${quem(m)}</b></div>${form('tirar-confiavel', { jid: m.jid }, 'Tirar da lista')}</div>`).join('')}</details>` : ''}`
}

// ---------- Gerenciador de links ----------
export function paginaLinks ({ c = {}, autorizados = [], apagados = [], nome = j => j, nomeGrupo = j => j }) {
  const ligado = c.links_ativo === '1'
  const opcao = (nome, texto) => `<label style="display:flex;gap:10px;align-items:center;color:var(--texto);font-size:15px;margin:0"><input type="checkbox" name="${nome}" value="1" ${c[nome] === '1' ? 'checked' : ''}> ${texto}</label>`
  return `<h2 style="margin-top:4px">Link da loja</h2>
<form method="post" action="/divulgacao/link" class="bloco">${opcao('link_ativo', 'Mandar o link da loja nos grupos ativos a cada hora')}
<label>Endereço da loja</label><input name="link_url" value="${esc(c.link_url)}" placeholder="https://" inputmode="url">
<label>Mensagem</label><textarea name="link_texto" rows="2">${esc(c.link_texto)}</textarea>
<p class="suave" style="margin:4px 0 0">Escreva {link} onde o endereço deve aparecer.</p>
<div class="linha"><div><label>A partir das</label><input type="number" min="0" max="23" name="link_hora_inicio" value="${esc(c.link_hora_inicio)}"></div>
<div><label>Até as</label><input type="number" min="1" max="24" name="link_hora_fim" value="${esc(c.link_hora_fim)}"></div></div>
<div class="acoes"><button class="prim">Salvar link da loja</button></div></form>

<h2>Link de pagamento</h2>
<form method="post" action="/links/pagamento" class="bloco"><label for="l-pag" style="margin-top:0">Link fixo de pagamento</label>
<input id="l-pag" name="ganhador_link" inputmode="url" placeholder="https://..." value="${esc(c.ganhador_link)}">
<p class="suave" style="margin:4px 0 0">Vai na mensagem do ganhador quando o Mercado Pago não está ligado (com ele, cada ganhador recebe um link próprio). Se o link aceitar valor, {valor} vira o total, ex.: 150.00. <a href="/config/pagamento">Mercado Pago ›</a></p>
<div class="acoes"><button class="prim">Salvar link de pagamento</button></div></form>

<h2>Bloqueio de links nos grupos</h2>
<form method="post" action="/links" class="bloco">
<label style="display:flex;gap:10px;align-items:center;color:var(--texto);font-size:15px;margin:0"><input type="checkbox" name="links_ativo" value="1" ${ligado ? 'checked' : ''}> Apagar links de quem não pode mandar</label>
<p class="suave" style="margin:8px 0 0">Podem mandar link: <b>administradores</b> do grupo, os <b>números autorizados</b> abaixo e qualquer pessoa, se o link for de um <b>site liberado</b>. Os outros links são apagados pelo bot na hora.</p>
<label for="l-dom">Sites liberados para todos</label>
<input id="l-dom" name="links_dominios" value="${esc(c.links_dominios)}" placeholder="Ex.: minhaloja.com.br, ligapokemon.com.br" autocapitalize="off" spellcheck="false">
<p class="suave" style="margin:4px 0 0">Separe por vírgula. Vale também para os subdomínios.</p>
<label for="l-aviso">Aviso no grupo depois de apagar <span class="suave">(opcional)</span></label>
<textarea id="l-aviso" name="links_aviso" rows="2">${esc(c.links_aviso)}</textarea>
<p class="suave" style="margin:4px 0 0">{nome} marca a pessoa. Deixe vazio para apagar sem avisar.</p>
<div class="acoes"><button class="prim">Salvar</button></div></form>
<p class="aviso" style="margin-top:0">O WhatsApp não deixa impedir o envio: o bot apaga a mensagem logo depois que ela chega. Para isso, o número do bot precisa ser <b>administrador</b> do grupo.</p>

<h2>Números autorizados a mandar link <small>${autorizados.length}</small></h2>
<div class="bloco" style="padding-top:4px;padding-bottom:4px">${autorizados.length ? autorizados.map(a => `<div class="grupo-linha">
<div style="min-width:0"><b>${esc(a.nome || nome(a.chave.includes('@') ? a.chave : a.chave + '@s.whatsapp.net'))}</b><br><span class="suave">${a.chave.includes('@') ? '' : '+' + esc(a.chave) + ' · '}autorizado ${haQuanto(a.desde)}${a.por ? ` por ${esc(a.por)}` : ''}</span></div>
<form method="post" action="/links/desautorizar"><input type="hidden" name="chave" value="${esc(a.chave)}"><button class="perigo" style="min-height:36px;padding:6px 12px;font-size:14px">Tirar</button></form></div>`).join('') : '<p class="suave">Nenhum número autorizado. Administradores já podem mandar.</p>'}
<form method="post" action="/links/autorizar" style="border-top:1px solid var(--linha);padding:12px 0 8px">
<div class="linha"><div><label style="margin-top:0">Número com DDD</label><input name="telefone" inputmode="tel" placeholder="47 99999-0000"></div>
<div><label style="margin-top:0">Nome <span class="suave">(opcional)</span></label><input name="nome" placeholder="Ex.: Parceiro da loja"></div></div>
<div class="acoes"><button>Autorizar</button></div></form></div>

<h2>Links apagados</h2>
<div class="bloco" style="padding-top:4px;padding-bottom:4px">${apagados.length ? `<ul class="feed">${apagados.map(l => `<li><span class="selo ${l.ok ? 'ok' : 'alerta'}">${l.ok ? 'Apagado' : 'Falhou'}</span><span class="quem">${esc(nome(l.jid))}</span><span class="tempo">${haQuanto(l.ts)}</span>
<span class="det" style="grid-column:2/-1">${esc(nomeGrupo(l.grupo))} · “${esc(l.trecho)}”${l.erro ? ` · <b style="color:var(--alerta)">${esc(l.erro)}</b>` : ''}</span></li>`).join('')}</ul>` : '<p class="suave">Nenhum link apagado ainda.</p>'}</div>`
}

const ORDEM = ['vendida', 'no_ar', 'fila', 'agendada', 'pendente', 'sem_lance']
function barraSituacao (cont, total) {
  if (!total) return ''
  return `<div class="seg" role="img" aria-label="${ORDEM.filter(k => cont[k]).map(k => `${cont[k]} ${STATUS[k][0].toLowerCase()}`).join(', ')}">${ORDEM.filter(k => cont[k]).map(k => `<i class="${STATUS[k][1]}" style="width:${(cont[k] / total) * 100}%"></i>`).join('')}</div>`
}

export function paginaLotes (lotes, agora = Date.now()) {
  // Lote com carta na fila, agendada ou ao vivo não pode ser excluído (o botão nem aparece).
  const podeExcluir = l => !(l.fila || l.agendada || l.no_ar)
  const avisoExcluir = l => `Excluir o lote "${l.nome}"?` + (l.vendida
    ? ` As cartas não vendidas são apagadas; as ${l.vendida} vendida(s) continuam em Vendas, Remessas e Relatórios.`
    : l.total ? ` As ${l.total} carta(s) dele são apagadas.` : '')
  const linha = l => `<div class="lote-item"><a class="lote-linha" href="/lotes/${l.id}">
<span class="pilha">${(l.fotos || []).slice(0, 3).map(f => `<img src="/fotos/${encodeURIComponent(f)}" alt="" loading="lazy">`).join('') || '<i></i>'}</span>
<span style="min-width:0"><b>${esc(l.nome)}</b><br><span class="suave">${[`${l.total} ${l.total === 1 ? 'carta' : 'cartas'}`, l.no_ar ? `${l.no_ar} ao vivo` : '', l.pendente ? `${l.pendente} para enviar` : '', (l.fila || 0) + (l.agendada || 0) ? `${(l.fila || 0) + (l.agendada || 0)} na fila` : '', l.sem_lance ? `${l.sem_lance} sem lance` : '', !l.ativo && l.vendida ? `${l.vendida} vendidas` : ''].filter(Boolean).join(' · ')}</span>${barraSituacao(l, l.total)}</span>
<span class="tot">${l.vendido ? moeda(l.vendido) : '<span class="suave">—</span>'}</span></a>${podeExcluir(l) ? botaoExcluir('/excluir/lotes', { sel: l.id }, avisoExcluir(l), 'Excluir lote', 'icone-so') : ''}</div>`
  // Lote vazio só fica "em andamento" no primeiro dia (acabou de ser criado); depois vai para os finalizados.
  for (const l of lotes) l.ativo = (!l.total && agora - (l.criado_em || 0) < 24 * 3600_000) || Boolean(l.pendente || l.fila || l.agendada || l.no_ar)
  const vazios = lotes.filter(l => !l.total).length
  const ativos = lotes.filter(l => l.ativo); const fim = lotes.filter(l => !l.ativo)
  return `<div class="bloco"><form method="post" action="/lotes">
<label for="novo-lote" style="margin-top:0">Novo lote</label><div style="display:flex;gap:8px"><input id="novo-lote" name="nome" placeholder="Ex.: Escarlate e Violeta, outubro" required><button class="prim">Criar</button></div></form></div>
${!lotes.length ? '<div class="bloco"><b>Nenhum lote ainda</b><p class="suave" style="margin:4px 0 0">Crie um lote acima e adicione as fotos das cartas.</p></div>' : ''}
${ativos.length ? `<h2>Em andamento <small>${ativos.length}</small></h2><div class="bloco" style="padding-top:4px;padding-bottom:4px">${ativos.map(linha).join('')}</div>` : ''}
${fim.length ? `<details class="bloco"${ativos.length ? '' : ' open'}><summary><b>Finalizados</b><span class="suave">${fim.length} · sem nada para enviar nem ao vivo</span></summary>${fim.map(linha).join('')}</details>` : ''}
${vazios > 1 ? `<div class="acoes">${botaoExcluir('/excluir/lotes', { vazios: 1 }, `Excluir os ${vazios} lotes vazios (sem nenhuma carta)?`, `Excluir os ${vazios} lotes vazios`)}</div>` : ''}`
}

const valoresRapidos = (prefixo, dicas) => `<div class="valores" style="grid-template-columns:repeat(4,1fr)">
<div><label>Lance 1</label><input name="${prefixo}v1" inputmode="decimal" placeholder="${dicas[0]}"></div>
<div><label>Lance 2</label><input name="${prefixo}v2" inputmode="decimal" placeholder="${dicas[1]}"></div>
<div><label>Lance 3</label><input name="${prefixo}v3" inputmode="decimal" placeholder="${dicas[2]}"></div>
<div><label>Arremate</label><input name="${prefixo}arremate" inputmode="decimal" placeholder="${dicas[3]}"></div></div>`

// ---------- Lote: abas por situação, cartas em grade e barra de ações embaixo ----------
export const ABAS_LOTE = [
  ['enviar', 'Para enviar', ['pendente']],
  ['fila', 'Na fila', ['fila', 'agendada']],
  ['vivo', 'Ao vivo', ['no_ar']],
  ['semlance', 'Sem lance', ['sem_lance']],
  ['vendidas', 'Vendidas', ['vendida']]
]
export function abaPadraoLote (cartas) {
  for (const k of ['enviar', 'vivo', 'fila', 'semlance', 'vendidas']) {
    const st = ABAS_LOTE.find(x => x[0] === k)[2]
    if (cartas.some(c => st.includes(c.status))) return k
  }
  return 'enviar'
}

const curto = v => v ? (v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : ''
function subCarta (c, lider, votos) {
  if (c.status === 'no_ar') return `<small data-lider-curto="${c.id}">${lider ? `${esc(nomeCurto(lider.votante))} · ${moeda(lider.valor)}${lider.tipo === 'arremate' ? ' ⚡' : ''}` : 'sem lance ainda'}</small><small class="suave" data-votos="${c.id}">${votos} ${votos === 1 ? 'voto' : 'votos'}</small>`
  if (c.status === 'vendida') return `<small>${esc(nomeCurto(c.vencedor))} · ${moeda(c.valor_venda)}${c.opcao_venda === 3 ? ' ⚡' : ''}</small>`
  if (c.status === 'agendada') return `<small>envio ${quando(c.enviar_em)}</small>`
  if (c.status === 'fila') return '<small>na fila de envio</small>'
  const lances = [c.v1, c.v2, c.v3].filter(Boolean).sort((x, y) => x - y)
  const falta = problemasCarta(c)
  return falta ? `<small class="falta">${falta}</small>` : `<small>R$ ${lances.map(curto).join(' · ')}${c.arremate ? ` · ⚡${curto(c.arremate)}` : ''}</small>`
}
// Mesmo critério do envio: 3 lances diferentes e arremate maior que o último.
function problemasCarta (c) {
  const l = [c.v1, c.v2, c.v3]
  if (l.some(v => !v)) return 'falta valor'
  if (new Set(l).size < 3) return 'lances repetidos'
  if (c.arremate && c.arremate <= Math.max(...l)) return 'arremate baixo'
  return ''
}

function itemLote (c, lider, votos, { editar = true, linkLote = '' } = {}) {
  const editavel = editar && EDITAVEL.includes(c.status)
  const dados = editavel ? ` data-editar="${c.id}" data-num="${numCarta(c)}" data-desc="${esc(c.descricao || '')}" data-v1="${esc(valorCampo(c.v1))}" data-v2="${esc(valorCampo(c.v2))}" data-v3="${esc(valorCampo(c.v3))}" data-arremate="${esc(valorCampo(c.arremate))}" data-foto="${foto(c)}" data-status="${STATUS[c.status]?.[0] || ''}"` : ''
  return `<div class="cx" id="c${c.id}"${dados}>
<label class="mk" aria-label="Marcar carta ${numCarta(c)}"><input type="checkbox" name="sel" value="${c.id}"><span>${icone('check', 14)}</span></label>
${editavel ? `<button type="button" class="cx-foto" data-abrir-carta="${c.id}" aria-label="Editar carta ${numCarta(c)}">` : `<a class="cx-foto" href="${foto(c)}" target="_blank">`}<img src="${foto(c)}" loading="lazy" alt="">${editavel ? '</button>' : '</a>'}
<b>#${numCarta(c)} ${primeiraLinha(c.descricao) || '<span class="suave">sem descrição</span>'}</b>${subCarta(c, lider, votos)}
${linkLote ? `<a class="link-lote" href="${linkLote}">Editar no lote ›</a>` : ''}<span class="erro-carta" data-erro="${c.id}">${c.erro ? esc(c.erro) : ''}</span></div>`
}

export function paginaLote (lote, cartas, lideres, votos = {}, previaTexto = '', grupos = [], aba = '', editar = 0, novas = '') {
  aba = ABAS_LOTE.some(x => x[0] === aba) ? aba : abaPadraoLote(cartas)
  const [, nomeAba, sts] = ABAS_LOTE.find(x => x[0] === aba)
  const daAba = cartas.filter(c => sts.includes(c.status))
  const vendido = cartas.reduce((t, c) => t + (c.status === 'vendida' ? c.valor_venda || 0 : 0), 0)
  const encerra = cartas.filter(c => c.status === 'no_ar' && c.encerra_em).map(c => c.encerra_em).sort((x, y) => x - y)[0]
  const n = k => cartas.filter(c => ABAS_LOTE.find(x => x[0] === k)[2].includes(c.status)).length

  const topo = `<div class="lote-cab"><h1>${esc(lote.nome)}</h1>
<details class="menu-mais"><summary aria-label="Mais opções do lote">···</summary><div>
<form method="post" action="/lotes/${lote.id}/renomear"><label>Nome do lote</label><div style="display:flex;gap:6px"><input name="nome" value="${esc(lote.nome)}" aria-label="Nome do lote"><button>Renomear</button></div></form>
<div style="margin-top:10px">${cartas.some(c => ['fila', 'agendada', 'no_ar'].includes(c.status))
    ? '<p class="suave" style="margin:0">Para excluir o lote, encerre ou tire da fila as cartas dele.</p>'
    : botaoExcluir('/excluir/lotes', { sel: lote.id }, `Excluir o lote "${lote.nome}"?` + (cartas.some(c => c.status === 'vendida') ? ' As cartas não vendidas são apagadas; as vendidas continuam em Vendas, Remessas e Relatórios.' : cartas.length ? ` As ${cartas.length} carta(s) dele são apagadas.` : ''), 'Excluir lote', 'largo')}</div></div></details></div>
<div class="lote-res">${vendido ? `<span class="selo ok">${moeda(vendido)} vendido</span>` : ''}<span class="suave">${cartas.length} ${cartas.length === 1 ? 'carta' : 'cartas'}${encerra ? ` · encerra ${quando(encerra)}` : ''}</span></div>
<nav class="abas-lote">${ABAS_LOTE.map(([k, t]) => `<a href="/lotes/${lote.id}?aba=${k}" class="${k === aba ? 'atual' : ''}"${k === aba ? ' aria-current="page"' : ''}>${t} <i>${n(k)}</i></a>`).join('')}</nav>`

  const adicionar = aba === 'enviar' ? `<details class="bloco add-fotos" ${cartas.length ? '' : 'open'}><summary><b>${icone('mais_add', 18)} Adicionar fotos</b><span class="suave">cada foto vira uma carta</span></summary>
<form method="post" action="/lotes/${lote.id}/fotos" enctype="multipart/form-data">
<div class="envio-fotos">
<label class="botao arquivo" style="margin:0">${icone('camera')}Tirar foto<input type="file" name="fotos" accept="image/*" capture="environment"></label>
<label class="botao arquivo" style="margin:0">${icone('galeria')}Da galeria<input type="file" name="fotos" accept="image/jpeg,image/png,image/webp" multiple></label>
</div>
<p class="suave" id="qtd-fotos" style="margin:8px 0 0">Nenhuma foto escolhida</p>
<label for="desc-padrao">Descrição para todas (opcional)</label><textarea id="desc-padrao" name="descricao" rows="1" placeholder="Ex.: Carta em português, estado NM"></textarea>
<p class="suave" style="margin:8px 2px 0">Os lances e o arremate você define depois, já com as cartas no lote.</p>
<div class="acoes"><button class="prim" id="enviar-fotos" disabled>Adicionar ao lote</button></div></form></details>` : ''

  const vazio = { enviar: 'Nenhuma carta para enviar. Adicione fotos acima.', fila: 'Nenhuma carta na fila.', vivo: 'Nenhuma carta ao vivo.', semlance: 'Nenhuma carta sem lance.', vendidas: 'Nenhuma carta vendida ainda.' }[aba]
  const grade = daAba.length ? `<div class="grade-lote">${daAba.map(c => itemLote(c, lideres[c.id], votos[c.id] || 0)).join('')}</div>` : `<div class="bloco"><span class="suave">${vazio}</span></div>`

  // Janelas (dialog) de ação: ficam dentro do formulário para levar as cartas marcadas.
  const janela = (id, titulo, corpo) => `<dialog class="janela" id="j-${id}"><div class="j-cab"><b>${titulo}</b><button type="button" class="fechar" data-fechar-janela aria-label="Fechar">${icone('x', 18)}</button></div>
<p class="suave j-alvo" data-alvo-texto></p>${corpo}</dialog>`
  const jEnviar = janela('enviar', aba === 'semlance' ? 'Reenviar' : 'Enviar', `${camposEnvio(grupos)}
<div class="acoes"><button class="prim" formaction="/lotes/${lote.id}/enviar">${aba === 'semlance' ? 'Reenviar' : 'Enviar'}</button></div>`)
  const jPrevia = janela('previa', 'Prévia', `<p class="suave" style="margin:0">Posta as fotos sem enquete, para o pessoal ver o que vem por aí.</p>
${escolhaGrupos('previa_destino', grupos, 'Postar em')}
<label for="previa-quando">Quando o leilão começa</label><input id="previa-quando" name="previa_quando" placeholder="Ex.: hoje às 20h">
<label for="previa-texto">Mensagem de abertura</label><textarea id="previa-texto" name="previa_texto" rows="3">${esc(previaTexto)}</textarea>
<p class="suave" style="margin:4px 2px 0">{n} vira o número de cartas e {quando} vira o horário acima.</p>
<label style="display:flex;gap:10px;align-items:center;color:var(--texto);font-size:15px;margin-top:12px"><input type="checkbox" name="previa_valores" value="1" checked> Mostrar lance inicial e arremate</label>
<div class="acoes"><button class="prim" formaction="/lotes/${lote.id}/previa">Postar prévia</button></div>`)
  const jValores = janela('valores', 'Valores em massa', `<label for="m-desc" style="margin-top:0">Descrição</label><textarea id="m-desc" name="m_descricao" rows="1" placeholder="Deixe vazio para não mudar"></textarea>
${valoresRapidos('m_', ['—', '—', '—', '—'])}
<p class="suave" style="margin:8px 2px 0">Só os campos preenchidos são alterados.</p>
<div class="acoes"><button class="prim" formaction="/lotes/${lote.id}/aplicar">Aplicar</button></div>`)

  const bt = (texto, extra) => `<button type="button" ${extra}>${texto}</button>`
  const acoes = {
    enviar: [bt('Enviar', 'class="prim" data-abrir-janela="enviar"'), bt('Prévia', 'data-abrir-janela="previa"'), bt('Valores', 'data-abrir-janela="valores"')],
    semlance: [bt('Reenviar', 'class="prim" data-abrir-janela="enviar"'), bt('Valores', 'data-abrir-janela="valores"')],
    fila: [`<button class="prim" formaction="/lotes/${lote.id}/cancelar">Tirar da fila</button>`, bt('Prévia', 'data-abrir-janela="previa"')],
    vivo: [`<button class="prim" formaction="/lotes/${lote.id}/encerrar" data-confirma="Encerrar agora e anunciar os ganhadores?">Encerrar</button>`],
    vendidas: ['<a class="botao" href="/vendas">Ver em Vendas</a>']
  }[aba]
  const podeExcluir = ['enviar', 'semlance', 'vendidas'].includes(aba)
  const barra = daAba.length ? `<div class="barra-lote" data-total="${daAba.length}">
<div class="bl-top"><span data-marcadas="Nenhuma marcada: vale para todas (${daAba.length})">Nenhuma marcada: vale para todas (${daAba.length})</span><button type="button" class="link" data-todas>Marcar todas</button></div>
<div class="bl-bts">${acoes.join('')}${podeExcluir ? `<button class="perigo icone-so" formaction="/lotes/${lote.id}/excluir-cartas" data-confirma="Excluir as cartas marcadas?" aria-label="Excluir marcadas" data-precisa-marcar>${icone('lixo', 18)}</button>` : ''}</div></div>` : ''

  // Janela de editar uma carta (formulário próprio).
  const jCarta = `<dialog class="janela" id="j-carta"><form method="post" action="/lotes/${lote.id}/salvar">
<input type="hidden" name="aba" value="${aba}"><input type="hidden" name="proxima" value="">
<div class="j-cab"><b>Carta <span data-c="num"></span></b><span class="suave" data-c="status"></span><button type="button" class="fechar" data-fechar-janela aria-label="Fechar">${icone('x', 18)}</button></div>
<div class="jc-corpo"><img data-c="foto" alt=""><div style="flex:1;min-width:0"><label style="margin-top:0">Descrição</label><textarea data-campo="descricao" rows="3"></textarea></div></div>
<label>Lances e arremate (R$)</label>
<div class="valores" style="grid-template-columns:repeat(4,1fr)"><input data-campo="v1" inputmode="decimal" placeholder="Lance 1" aria-label="Lance 1"><input data-campo="v2" inputmode="decimal" placeholder="Lance 2" aria-label="Lance 2"><input data-campo="v3" inputmode="decimal" placeholder="Lance 3" aria-label="Lance 3"><input data-campo="arremate" inputmode="decimal" placeholder="⚡ Arremate" aria-label="Arremate"></div>
<div class="jc-nav"><button type="button" data-ir="-1">‹ Anterior</button><button type="button" data-ir="1">Próxima ›</button></div>
<div class="acoes"><button class="prim" style="flex:1">Salvar</button><button data-salvar-proxima>Salvar e próxima ›</button></div>
<div class="acoes"><button class="perigo link" formaction="/lotes/${lote.id}/excluir-cartas" data-confirma="Excluir esta carta?" name="sel" data-c="excluir">Excluir carta</button></div>
</form></dialog>`

  return `${topo}${adicionar}
<form method="post" action="/lotes/${lote.id}/salvar" class="form-lote"><input type="hidden" name="aba" value="${aba}">
${daAba.length ? `<p class="suave dica-lote">${aba === 'vivo' ? 'Toque na foto para ver ampliada. Os lances se atualizam sozinhos.' : ['enviar', 'semlance'].includes(aba) ? 'Toque na carta para editar descrição e valores. Marque para enviar, ver a prévia ou mudar valores de várias de uma vez.' : `${nomeAba}: ${daAba.length}`}</p>` : ''}
${grade}${barra}${jEnviar}${jPrevia}${jValores}</form>${jCarta}
${editar ? `<span hidden data-abrir-ao-carregar="${editar}"></span>` : ''}${/^\d+-\d+$/.test(novas) && aba === 'enviar' ? `<span hidden data-valores-novas="${novas}"></span>` : ''}`
}

export function paginaNoAr (cartas, lideres, votos = {}) {
  if (!cartas.length) return '<div class="bloco"><b>Nenhuma carta ao vivo</b><p class="suave" style="margin:4px 0 0">Quando você enviar cartas para o grupo, elas aparecem aqui com o lance atual.</p></div>'
  const comLance = cartas.filter(c => lideres[c.id]).length
  return `<div class="numeros"><div><small>Ao vivo</small><b>${cartas.length}</b></div><div><small>Com lance</small><b>${comLance}</b></div><div><small>Sem lance</small><b>${cartas.length - comLance}</b></div></div>
<form method="post" action="/no-ar/encerrar">
<div class="cartas">${cartas.map(c => cartaoCarta(c, { editar: false, lider: lideres[c.id], votos: votos[c.id] || 0 })).join('')}</div>
<div class="fixa"><button type="button" data-todas>Marcar todas</button><span class="suave" data-marcadas="Marque para encerrar">Marque para encerrar</span><button class="prim" data-confirma="Encerrar as cartas marcadas e anunciar os ganhadores no grupo?">Encerrar</button></div></form>`
}

export function paginaSemLance (cartas, grupos = []) {
  if (!cartas.length) return '<div class="bloco"><b>Todas as cartas tiveram lance</b><p class="suave" style="margin:4px 0 0">As que encerrarem sem nenhum voto aparecem aqui para reenviar.</p></div>'
  return `<p class="suave dica-lote">Descrição e valores mudam dentro do lote (toque em "Editar no lote"). Aqui é só para reenviar: a enquete é criada de novo, sem os votos antigos.</p>
<form method="post" action="/sem-lance/reenviar" class="form-lote">
<div class="grade-lote">${cartas.map(c => itemLote(c, null, 0, { editar: false, linkLote: `/lotes/${c.lote_id}?aba=semlance&editar=${c.id}` })).join('')}</div>
<div class="barra-lote" data-total="${cartas.length}"><div class="bl-top"><span data-marcadas="Nenhuma marcada: vale para todas (${cartas.length})">Nenhuma marcada: vale para todas (${cartas.length})</span><button type="button" class="link" data-todas>Marcar todas</button></div>
<div class="bl-bts"><button type="button" class="prim" data-abrir-janela="reenviar">Reenviar</button></div></div>
<dialog class="janela" id="j-reenviar"><div class="j-cab"><b>Reenviar</b><button type="button" class="fechar" data-fechar-janela aria-label="Fechar">${icone('x', 18)}</button></div>
<p class="suave j-alvo" data-alvo-texto></p>${camposEnvio(grupos)}<div class="acoes"><button class="prim">Reenviar</button></div></dialog></form>`
}

// Situação do aviso de vitória (e do pagamento) das cartas de um comprador.
function situacaoAviso (cartas, avisos, pagas = {}) {
  if (cartas.length && cartas.every(c => pagas[c.id])) return '<span class="selo ok">✓ Pago</span>'
  const lista = cartas.map(c => avisos[c.id])
  if (lista.every(a => a?.ok)) return '<span class="selo ok">✓ Avisado no privado</span>'
  const erro = lista.find(a => a && !a.ok)
  if (erro) return `<span class="selo alerta" title="${esc(erro.erro || '')}">Aviso falhou</span>`
  return '<span class="selo">Não avisado</span>'
}

// Cobranças em aberto e pagas (topo da tela Vendas).
function blocoCobrancas (cb) {
  if (!cb) return ''
  const horas = String(cb.horas || '').split(',').join(' e ')
  const topo = `<div class="bloco"><p class="suave" style="margin:0">${cb.mp ? '✓ Mercado Pago ligado: o bot confere os pagamentos sozinho a cada minuto. Cada código Pix vale 5 minutos.' : 'Sem Mercado Pago: marque como pago quando o dinheiro cair.'}
${cb.lembretes ? `Lembretes para quem não pagou às ${esc(horas)}.` : 'Lembretes desligados.'} <a href="/config/pagamento">Ajustes ›</a></p>
${cb.mp ? '<form method="post" action="/cobrancas/verificar" class="acoes" style="margin-top:10px"><button>Conferir pagamentos agora</button></form>' : ''}</div>`
  const pend = cb.pendentes.length
    ? cb.pendentes.map(b => `<div class="bloco"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><b>${esc(b.nome)}</b><b>${moeda(b.total)}</b></div>
<p class="suave" style="margin:4px 0 0">${b.cartas.map(c => `#${numCarta(c)} ${primeiraLinha(c.descricao)}`).join(', ') || 'sem cartas'}<br>Desde ${dataHora(b.criada_em)} · ${b.lembretes} ${b.lembretes === 1 ? 'lembrete' : 'lembretes'}${b.proximo ? ` · próximo ${quando(b.proximo)}` : cb.lembretes ? '' : ' · lembretes desligados'}${b.link ? ` · <a href="${esc(b.link)}" target="_blank" rel="noopener">link</a>` : ''}</p>
<form method="post" class="acoes"><button formaction="/cobrancas/${b.id}/lembrar" data-confirma="Mandar um lembrete de pagamento agora?">Lembrar agora</button><button class="prim" formaction="/cobrancas/${b.id}/pago" data-confirma="Marcar como pago? Os lembretes param e a pessoa recebe a confirmação.">Marcar como pago</button><button class="perigo" formaction="/cobrancas/${b.id}/cancelar" data-confirma="Parar de cobrar? O bot não manda mais lembretes para esta cobrança.">Parar cobrança</button>${botaoExcluir('/excluir/pagamentos', { sel: b.id }, `Excluir a cobrança de ${b.nome} (${moeda(b.total)})? Os lembretes param e ela some daqui.`, 'Excluir', 'icone-so')}</form></div>`).join('')
    : '<div class="bloco"><span class="suave">Ninguém devendo. 🎉</span></div>'
  const pagas = cb.pagas.length
    ? `<details class="bloco"><summary><b>Pagas recentemente</b><span class="suave">${cb.pagas.length}</span></summary><table>${cb.pagas.map(b => `<tr><td>${esc(b.nome)}<br><span class="suave">${dataHora(b.pago_em)} · ${esc(b.pago_por || '')}</span></td><td class="num">${moeda(b.total)}</td><td style="width:44px">${botaoExcluir('/excluir/pagamentos', { sel: b.id }, `Excluir o pagamento de ${b.nome} (${moeda(b.total)}) do histórico?`, 'Excluir', 'icone-so')}</td></tr>`).join('')}</table></details>`
    : ''
  return `<h2>Pagamentos em aberto${cb.pendentes.length ? ` (${cb.pendentes.length})` : ''}</h2>${topo}<h2>Em aberto <small>${cb.pendentes.length}</small></h2>${pend}${pagas}`
}

export function paginaVendas (porComprador, resumo, avisos = {}, pagas = {}) {
  const nova = porComprador.length
    ? porComprador.map(g => `<details class="bloco" open><summary><b>${esc(nomeCurto(g.comprador))}</b><span class="suave">${g.cartas.length} ${g.cartas.length === 1 ? 'carta' : 'cartas'}, ${moeda(g.total)}</span></summary>
<form method="post" action="/remessas">
<input type="hidden" name="comprador" value="${esc(g.comprador)}">
<table>${g.cartas.map(c => `<tr><td style="width:30px"><input type="checkbox" name="sel" value="${c.id}" checked aria-label="Incluir carta ${numCarta(c)}"></td><td>#${numCarta(c)} ${primeiraLinha(c.descricao)}<br><span class="suave">${dataHora(c.encerrada_em)}</span></td><td class="num">${moeda(c.valor_venda)}</td></tr>`).join('')}</table>
<div class="linha"><div><label>Nome</label><input name="nome" value="${esc(g.nome || '')}"></div>
<div><label>Telefone</label><input name="telefone" value="${esc(g.telefone || '')}"></div></div>
<label>Endereço de entrega</label><textarea name="endereco" rows="2"></textarea>
<div class="acoes"><button class="prim">Criar remessa</button><button formaction="/vendas/avisar" data-confirma="Mandar no privado as fotos e o link de pagamento para este comprador?">Mandar aviso de novo</button>${situacaoAviso(g.cartas, avisos, pagas)}${botaoExcluir('/excluir/vendas', {}, `Excluir {n} venda(s) marcada(s) de ${nomeCurto(g.comprador)}? A carta é apagada, sai dos relatórios, e a cobrança dela também.`, 'Excluir', 'icone-so', true)}</div></form></details>`).join('')
    : '<div class="bloco"><span class="suave">Nenhuma venda esperando remessa.</span></div>'

  return `<div class="numeros">
<div><small>Sem remessa</small><b>${reais(resumo.semRemessa)}</b><span>${porComprador.length} ${porComprador.length === 1 ? 'comprador' : 'compradores'}</span></div>
<a href="/pagamentos"><small>Em cobrança</small><b>${reais(resumo.aguardando)}</b><span>${resumo.cobrancas} ${resumo.cobrancas === 1 ? 'cobrança' : 'cobranças'}</span></a>
<a href="/remessas"><small>Para enviar</small><b>${resumo.separar}</b><span>já pagas</span></a>
</div>
<h2>Vendidas, sem remessa</h2>${nova}`
}

// Botão de excluir: abre a janela que pede a senha (o servidor faz backup antes de excluir).
function botaoExcluir (rota, campos, texto, rotulo = 'Excluir', classe = '', marcadas = false) {
  const so = classe.includes('icone-so')
  return `<button type="button" class="perigo ${classe}" data-excluir="${rota}" data-ex-campos="${esc(JSON.stringify(campos))}" data-ex-texto="${esc(texto)}"${marcadas ? ' data-ex-marcadas' : ''}${so ? ` aria-label="${esc(rotulo)}" title="${esc(rotulo)}"` : ''}>${icone('lixo', 16)}${so ? '' : ` ${esc(rotulo)}`}</button>`
}

// ---------- Pagamentos ----------
export function paginaPagamentos (cobrancas) {
  return blocoCobrancas(cobrancas).replace(/^<h2>[^<]*<\/h2>/, '') || '<div class="bloco"><span class="suave">Nenhuma cobrança ainda.</span></div>'
}

// ---------- Remessas ----------
const COR_MARCO = { postado: 'neutro', transito: 'vivo', saiu: 'fila', retirada: 'alerta', entregue: 'ok', problema: 'alerta' }
function blocoRastreio (r, marcos, transportadoras) {
  if (!r.rastreio) return '<p class="suave" style="margin:8px 0 0">Coloque o código de rastreio e salve: o bot manda para o comprador e passa a acompanhar.</p>'
  const linhas = []
  linhas.push(`<b style="font-family:ui-monospace,monospace;letter-spacing:.03em">${esc(r.rastreio)}</b> <span class="suave">${esc(transportadoras[r.transp] || '')}</span>`)
  if (r.rastreio_marco) linhas.push(`<span class="selo ${COR_MARCO[r.rastreio_marco] || 'neutro'}">${esc(marcos[r.rastreio_marco] || r.rastreio_marco)}</span> ${esc(r.rastreio_ultimo || '')}${r.rastreio_local ? ` · ${esc(r.rastreio_local)}` : ''}${r.rastreio_ultimo_em ? ` <span class="suave">${dataHora(r.rastreio_ultimo_em)}</span>` : ''}`)
  else if (r.leitura) linhas.push('<span class="suave">Ainda sem movimentação.</span>')
  linhas.push(`<span class="suave">${r.rastreio_avisado ? `Código mandado ao comprador ${quando(r.rastreio_avisado)}` : 'Código ainda não mandado ao comprador'}${r.rastreio_conferido ? ` · conferido ${quando(r.rastreio_conferido)}` : ''}${r.leitura ? '' : ' · sem leitura automática'}</span>`)
  if (r.rastreio_erro) linhas.push(`<span style="color:var(--alerta)">${esc(r.rastreio_erro)}</span>`)
  return `<div class="rastreio">${linhas.map(l => `<div>${l}</div>`).join('')}</div>`
}

export function paginaRemessas (remessas, { marcos = {}, transportadoras = {}, temChave = false, usoMes = 0, limite = 950 } = {}) {
  const abertas = remessas.filter(r => r.status !== 'entregue')
  const entregues = remessas.filter(r => r.status === 'entregue')
  const card = r => `<details class="bloco" ${r.status === 'entregue' ? '' : 'open'}><summary><b>${esc(r.nome || nomeCurto(r.comprador))}</b><span class="selo ${COR_REMESSA[r.status] || 'neutro'}">${STATUS_REMESSA[r.status] || r.status}</span></summary>
<form method="post" action="/remessas/${r.id}">
<p class="suave" style="margin-top:0">Remessa #${r.id}, criada em ${dataHora(r.criada_em)}<br>${r.cartas.map(c => `#${numCarta(c)} ${primeiraLinha(c.descricao)}`).join(', ')}<br>Total <b style="color:var(--texto)">${moeda(r.total)}</b></p>
${blocoRastreio(r, marcos, transportadoras)}
<div class="linha"><div><label>Código de rastreio</label><input name="rastreio" value="${esc(r.rastreio || '')}" autocapitalize="characters" autocomplete="off" placeholder="Ex.: AB123456789BR"></div>
<div><label>Transportadora</label><select name="transportadora">${Object.entries(transportadoras).map(([k, t]) => `<option value="${k}"${k === (r.transportadora || '') ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
<div class="linha"><div><label>Situação</label><select name="status">${Object.entries(STATUS_REMESSA).map(([k, t]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
<div><label>Telefone</label><input name="telefone" value="${esc(r.telefone || '')}"></div></div>
<label>Endereço de entrega</label><textarea name="endereco" rows="2">${esc(r.endereco || '')}</textarea>
<label>Observações</label><input name="obs" value="${esc(r.obs || '')}">
<div class="acoes"><button class="prim">Salvar remessa</button>
${r.rastreio ? `<button formaction="/remessas/${r.id}/codigo" data-confirma="Mandar o código de rastreio para o comprador?">Mandar código</button>${r.leitura && temChave ? `<button formaction="/remessas/${r.id}/rastreio">Conferir rastreio</button>` : ''}` : ''}
<button class="perigo" formaction="/remessas/${r.id}/desfazer" data-confirma="Desfazer esta remessa? As cartas voltam para a lista de vendidas.">Desfazer</button>
${botaoExcluir('/excluir/remessas', { sel: r.id }, `Excluir a remessa #${r.id} (${r.nome || nomeCurto(r.comprador)})? As vendas continuam nos relatórios.`)}</div>
</form></details>`
  return `<div class="bloco"><p class="suave" style="margin:0">Ao salvar um código de rastreio, o bot manda para o comprador e marca a remessa como <b>Enviado</b>. ${temChave ? `Depois ele confere as atualizações sozinho e avisa o comprador a cada etapa (postado, a caminho, saiu para entrega, entregue). Consultas este mês: ${usoMes} de ${limite}.` : 'Para ele acompanhar as atualizações sozinho, coloque a chave do serviço de rastreio.'} <a href="/config/rastreio">Ajustes ›</a></p></div>
<h2>Em andamento <small>${abertas.length}</small></h2>${abertas.length ? abertas.map(card).join('') : '<div class="bloco"><span class="suave">Nenhuma remessa em andamento. Crie em <a href="/vendas">Vendas</a>.</span></div>'}
${entregues.length ? `<h2>Entregues <small>${entregues.length}</small></h2>${entregues.map(card).join('')}
<div class="acoes">${botaoExcluir('/excluir/remessas', { entregues: 1 }, `Excluir as ${entregues.length} remessas entregues? As vendas continuam nos relatórios.`, 'Excluir todas as entregues')}</div>` : ''}`
}

// Gráfico de barras simples em SVG (vendas por período).
function grafico (serie) {
  if (!serie.length) return ''
  const L = 600; const A = 220; const esq = 8; const base = A - 30
  const max = Math.max(1, ...serie.map(s => s.total))
  const larg = (L - esq) / serie.length
  const passo = Math.ceil(serie.length / 6)
  const barras = serie.map((s, i) => {
    const h = Math.round((s.total / max) * (base - 26))
    const x = esq + i * larg
    const w = Math.max(3, larg * 0.62)
    return `<g><title>${s.rotulo}: ${moeda(s.total)} (${s.qtd} ${s.qtd === 1 ? 'carta' : 'cartas'})</title>
<rect class="alvo" x="${x}" y="0" width="${larg}" height="${base}" fill="transparent"/><rect class="barra-g" x="${x + (larg - w) / 2}" y="${base - h}" width="${w}" height="${h}" rx="3"/>
${i % passo === 0 ? `<text x="${x + larg / 2}" y="${A - 4}" text-anchor="middle">${s.rotulo}</text>` : ''}</g>`
  }).join('')
  return `<div class="grafico"><svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Vendas por período">
<line class="grade" x1="${esq}" y1="${base}" x2="${L}" y2="${base}"/><text x="${esq}" y="18">${moeda(max)}</text>${barras}</svg></div>`
}

export function paginaRelatorios (r, PERIODOS) {
  const pct = r.taxa === null ? '—' : `${Math.round(r.taxa * 100)}%`
  return `<div class="periodo">${Object.entries(PERIODOS).map(([k, p]) => `<a href="/relatorios?periodo=${k}" class="${k === r.chave ? 'atual' : ''}">${p.nome}</a>`).join('')}</div>
<div class="numeros grande"><div><small>Vendido</small><b>${reais(r.total)}</b><span>${r.qtd} ${r.qtd === 1 ? 'carta' : 'cartas'}</span></div>
<div><small>Por carta</small><b>${reais(r.ticket)}</b><span>em média</span></div>
<div><small>Vendidas</small><b>${pct}</b><span>${r.semLance} sem lance</span></div></div>
<div class="contadores"><a href="/vendas"><b>${reais(r.aReceber)}</b> a receber</a><a href="/vendas"><b>${r.arremates}</b> no arremate</a></div>
<h2>Vendas no período</h2>
<div class="bloco">${r.qtd ? grafico(r.serie) : '<span class="suave">Nenhuma venda neste período.</span>'}</div>
<h2>Por lote</h2>
<div class="bloco tabela">${r.porLote.length ? `<table><tr><th>Lote</th><th class="num">Vendidas</th><th class="num">Total</th></tr>
${r.porLote.map(l => `<tr><td><a href="/lotes/${l.id}">${esc(l.nome)}</a><br><span class="suave">${l.sem_lance} sem lance</span></td><td class="num">${l.vendidas}</td><td class="num">${moeda(l.total)}</td></tr>`).join('')}</table>` : '<span class="suave">Nada no período.</span>'}</div>
<h2>Quem mais comprou</h2>
<div class="bloco tabela">${r.compradores.length ? `<table><tr><th>Comprador</th><th class="num">Cartas</th><th class="num">Total</th></tr>
${r.compradores.map(c => `<tr><td>${esc(nomeCurto(c.jid))}</td><td class="num">${c.qtd}</td><td class="num">${moeda(c.total)}</td></tr>`).join('')}</table>` : '<span class="suave">Nada no período.</span>'}</div>
<h2>Mais disputadas</h2>
<div class="bloco tabela">${r.disputadas.length ? `<table><tr><th>Carta</th><th class="num">Votos</th><th class="num">Saiu por</th></tr>
${r.disputadas.map(c => `<tr><td><a href="/lotes/${c.lote_id}">#${numCarta(c)}</a> ${primeiraLinha(c.descricao)}</td><td class="num">${c.votos}</td><td class="num">${moeda(c.valor_venda)}</td></tr>`).join('')}</table>` : '<span class="suave">Nada no período.</span>'}</div>
${r.qtd || r.semLance ? `<div class="acoes" style="margin-top:18px">${botaoExcluir('/excluir/relatorio', { periodo: r.chave }, `Excluir dos relatórios as cartas encerradas em "${r.periodo.nome}"? Vendas, pagamentos e remessas não mudam.`, `Excluir dados de ${r.periodo.nome === 'Tudo' ? 'todo o período' : r.periodo.nome}`)}</div>` : ''}`
}


// ---------- Entrar / esqueci a senha (modelo C) ----------
const CSS_ENTRADA = `
body.entrada{min-height:100dvh;padding:0;background-color:var(--bg);background-image:radial-gradient(color-mix(in srgb,var(--texto) 7%,transparent) 1px,transparent 1px);background-size:22px 22px}
.ent{max-width:420px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column;padding:max(56px,env(safe-area-inset-top)) 24px 26px}
.ent-ic{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;background:var(--sup2);border:1px solid var(--linha);box-shadow:0 0 0 6px color-mix(in srgb,var(--volt) 9%,transparent)}
.ent-ic i{width:24px;height:34px;border-radius:5px;background:var(--holo);background-size:250% 100%;transform:rotate(-10deg);box-shadow:inset 0 0 0 2px rgba(255,255,255,.45);animation:holo 7s linear infinite}
.ent h1{font-size:30px;line-height:1.1;margin:22px 0 6px;letter-spacing:-.02em}
.ent h1 em{font-style:italic;font-weight:900;background:var(--holo);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:holo 7s linear infinite}
.ent .sub{color:var(--suave);margin:0 0 10px}
.ent label{font-size:13px;font-weight:600;margin:14px 2px 6px}
.cmp{position:relative}.cmp>svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--suave);pointer-events:none}
.cmp input{height:52px;border-radius:14px;padding-left:44px;font-size:16px}
.cmp input:focus{border-color:var(--volt);box-shadow:0 0 0 3px color-mix(in srgb,var(--volt) 20%,transparent)}
.cmp input.cod{padding-left:14px;text-align:center;font-size:26px;letter-spacing:.35em;font-variant-numeric:tabular-nums;font-weight:700}
.cmp .ver{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:40px;height:40px;min-height:40px;padding:0;border:0;background:none;color:var(--suave);display:grid;place-items:center}
.cmp .ver[aria-pressed="true"]{color:var(--volt-txt)}
.ent .lembrar{display:flex;align-items:center;gap:10px;margin:14px 2px 0;font-size:14px;color:var(--suave)}
.ent button.prim{width:100%;height:54px;border-radius:14px;font-size:16px;font-weight:800;margin-top:20px}
.ent .link-esq{display:block;text-align:center;margin-top:16px;font-weight:600;color:var(--vivo);text-decoration:none}
.ent .aviso{margin:14px 0 0}
.ent .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}
.ent .chips span{font-size:12.5px;padding:5px 10px;border-radius:99px;font-weight:700}
.ent .pe{margin-top:auto;padding-top:28px;font-size:12.5px;color:var(--apagado);text-align:center}
`
const campo = (ic, input, olho = false) => `<div class="cmp">${icone(ic, 20)}${input}${olho ? `<button type="button" class="ver" data-ver aria-label="Mostrar senha" aria-pressed="false">${icone('olho', 20)}</button>` : ''}</div>`

export function paginaEntrada (corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Entrar · CartaDex</title>
<meta name="theme-color" content="#131418"><meta name="robots" content="noindex">
<script>try{if(localStorage.getItem('tema')==='claro'){document.documentElement.dataset.tema='claro';document.querySelector('meta[name=theme-color]').content='#f3f3f6'}}catch(e){}</script>
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icone-192.png"><link rel="apple-touch-icon" href="/icone-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">
<style>${CSS}${CSS_ENTRADA}</style></head><body class="entrada"><main class="ent">${corpo}</main>
<script>
// Ao voltar/avançar no navegador: campos sempre limpos (senha, código e senha nova nunca ficam preenchidos).
const limpar=()=>document.querySelectorAll('form').forEach(f=>{f.reset();f.querySelectorAll('input[type=password],input[name=codigo],input[name=nova],input[name=confirma]').forEach(i=>{i.value='';i.type=i.name==='codigo'?'text':'password'});
f.querySelectorAll('[data-ver]').forEach(b=>b.setAttribute('aria-pressed','false'));const b=f.querySelector('button.prim');if(b&&b.dataset.t){b.disabled=false;b.textContent=b.dataset.t}});
addEventListener('pageshow',e=>{limpar();if(e.persisted)location.reload()});
// Na tela de entrar, o botão "voltar" não leva de volta para dentro do painel.
if(location.pathname==='/entrar'){history.replaceState({cdx:1},'',location.href);history.pushState({cdx:2},'',location.href);addEventListener('popstate',()=>{history.pushState({cdx:2},'',location.href)})}
document.querySelectorAll('[data-ver]').forEach(b=>b.addEventListener('click',()=>{const i=b.parentNode.querySelector('input');const v=i.type==='password';i.type=v?'text':'password';b.setAttribute('aria-pressed',v);b.setAttribute('aria-label',v?'Esconder senha':'Mostrar senha')}));
document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',()=>{const b=f.querySelector('button.prim');if(b){setTimeout(()=>{b.disabled=true},0);b.dataset.t=b.textContent;b.textContent='Aguarde…'}}));</script></body></html>`
}

const topoEntrada = (titulo, sub) => `<div class="ent-ic" aria-hidden="true"><i></i></div><h1>${titulo}</h1><p class="sub">${sub}</p>`
const avisoEnt = (msg, erro) => `${msg ? `<div class="aviso" role="status">${esc(msg)}</div>` : ''}${erro ? `<div class="aviso erro" role="alert">${esc(erro)}</div>` : ''}`

export function formEntrar ({ usuario = '', volta = '/', msg = '', erro = '', bot = false } = {}) {
  return `${topoEntrada('Entre no<br><em>CartaDex</em>', 'Use o seu usuário e senha da equipe.')}${avisoEnt(msg, erro)}
<form method="post" action="/entrar" autocomplete="on"><input type="hidden" name="volta" value="${esc(volta)}">
<label for="e-usuario">Usuário</label>${campo('usuario', `<input id="e-usuario" name="usuario" value="${esc(usuario)}" autocomplete="username" autocapitalize="none" spellcheck="false" required${usuario ? '' : ' autofocus'}>`)}
<label for="e-senha">Senha</label>${campo('cadeado', `<input id="e-senha" type="password" name="senha" autocomplete="current-password" required${usuario ? ' autofocus' : ''}>`, true)}
<label class="lembrar"><input type="checkbox" name="lembrar" value="1" checked> Manter conectado neste aparelho</label>
<button class="prim">Entrar →</button></form>
<a class="link-esq" href="/esqueci${usuario ? '?u=' + encodeURIComponent(usuario) : ''}">Esqueceu a senha?</a>
<div class="chips"><span class="selo ${bot ? 'ok' : 'alerta'}">● ${bot ? 'Bot online' : 'Bot desconectado'}</span><span class="selo fila">Conexão protegida</span></div>
<p class="pe">CartaDex · painel do leilão</p>`
}

export function formEsqueci ({ usuario = '', erro = '', bot = true } = {}) {
  return `${topoEntrada('Esqueceu a<br><em>senha?</em>', 'O bot manda um código de 6 números no WhatsApp cadastrado. Com ele você cria uma senha nova.')}${avisoEnt('', erro)}
<form method="post" action="/esqueci" autocomplete="off">
<label for="q-usuario">Seu usuário</label>${campo('usuario', `<input id="q-usuario" name="usuario" value="${esc(usuario)}" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>`)}
<button class="prim"${bot ? '' : ' disabled'}>Mandar código no WhatsApp</button></form>
<a class="link-esq" href="/entrar">‹ Voltar para o login</a>
<p class="pe">Sem WhatsApp cadastrado, o código vai para o administrador.</p>`
}

export function formCodigo ({ usuario = '', erro = '' } = {}) {
  return `${topoEntrada('Digite o<br><em>código</em>', `Se o usuário <b>${esc(usuario || '?')}</b> existir e tiver WhatsApp cadastrado, o código acabou de chegar. Ele vale 10 minutos.`)}${avisoEnt('', erro)}
<form method="post" action="/esqueci/codigo" autocomplete="off"><input type="hidden" name="usuario" value="${esc(usuario)}">
<label for="c-cod">Código</label>${campo('chave', `<input id="c-cod" class="cod" name="codigo" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" autocomplete="one-time-code" placeholder="000000" required autofocus>`)}
<label for="c-nova">Senha nova</label>${campo('cadeado', `<input id="c-nova" type="password" name="nova" minlength="8" autocomplete="new-password" required>`, true)}
<label for="c-conf">Repita a senha nova</label>${campo('cadeado', `<input id="c-conf" type="password" name="confirma" minlength="8" autocomplete="new-password" required>`, true)}
<button class="prim">Criar senha e entrar</button></form>
<a class="link-esq" href="/esqueci?u=${encodeURIComponent(usuario)}">Não chegou? Pedir outro código</a>
<p class="pe">Pelo menos 8 caracteres. Os outros aparelhos conectados saem.</p>`
}

export function paginaUsuarios (equipe, { admin = '', escolhido = '', aparelhos = 0, minima = 8 } = {}) {
  const pessoa = p => {
    const visto = p.ultimo ? (Date.now() - p.ultimo < 5 * 60_000 ? 'online agora' : `visto ${haQuanto(p.ultimo)}`) : 'ainda não entrou'
    const acoes = p.acoesHoje ? ` · ${p.acoesHoje} ${p.acoesHoje === 1 ? 'ação' : 'ações'} hoje` : ''
    return `<a href="/atividade?quem=${encodeURIComponent(p.nome.toLowerCase())}" class="pessoa">
<i aria-hidden="true">${esc(p.nome.charAt(0))}</i><b><em>${esc(p.nome)}${p.voce ? ' <small class="selo ok">você</small>' : ''}</em><small class="suave">${visto}${acoes}</small></b>${icone('seta', 18)}</a>`
  }
  const comNumero = equipe.filter(p => p.whats)
  return `<div class="bloco lista-mais equipe" style="padding-top:2px;padding-bottom:2px">${equipe.map(pessoa).join('')}</div>
<p class="suave" style="margin:4px 4px 0">Toque numa pessoa para ver o que ela fez no painel.</p>
<h2>WhatsApp da equipe</h2>
<form method="post" action="/usuarios/whats" class="bloco">
<p class="suave" style="margin:0">É para onde vai o código de acesso do "Esqueceu a senha?". Use DDD + número.</p>
${equipe.map(p => `<label for="w-${esc(p.login)}">${esc(p.nome)}</label><input id="w-${esc(p.login)}" name="tel[${esc(p.login)}]" value="${p.whats ? esc(p.whats.replace(/^55/, '')) : ''}" inputmode="tel" placeholder="Ex.: 47 99999-0000" autocomplete="off">`).join('')}
<label for="w-admin">Quem não tiver número: o código vai para</label><select id="w-admin" name="codigo_admin">${equipe.map(p => `<option value="${esc(p.login)}"${p.login === (escolhido || admin || equipe.find(x => x.voce)?.login) ? ' selected' : ''}>${esc(p.nome)}${p.whats ? '' : ' (sem número)'}</option>`).join('')}</select>
${comNumero.length ? '' : '<p class="aviso erro" style="margin:10px 0 0">Ninguém tem WhatsApp cadastrado: o "Esqueceu a senha?" não vai funcionar.</p>'}
<label for="w-senha">Sua senha, para confirmar</label><input id="w-senha" type="password" name="senha" autocomplete="current-password" required>
<p class="suave" style="margin:6px 2px 0">Quem tinha número cadastrado recebe um aviso no WhatsApp antigo quando ele é trocado.</p>
<div class="acoes"><button class="prim">Salvar</button></div></form>
<h2>Minha senha</h2>
<form method="post" action="/usuarios/senha" class="bloco" autocomplete="off">
<label for="s-atual" style="margin-top:0">Senha atual</label><input id="s-atual" type="password" name="atual" autocomplete="current-password" required>
<div class="linha"><div><label for="s-nova">Senha nova</label><input id="s-nova" type="password" name="nova" minlength="${minima}" autocomplete="new-password" required></div>
<div><label for="s-conf">Repita</label><input id="s-conf" type="password" name="confirma" minlength="${minima}" autocomplete="new-password" required></div></div>
<p class="suave" style="margin:8px 2px 0">Pelo menos ${minima} caracteres. Os outros aparelhos conectados com o seu usuário saem.</p>
<div class="acoes"><button class="prim">Trocar senha</button></div></form>
<form method="post" action="/usuarios/sair-outros" class="acoes"><button data-confirma="Desconectar o seu usuário de todos os outros aparelhos?">${icone('sair', 16)} Sair dos outros aparelhos${aparelhos > 1 ? ` (${aparelhos - 1})` : ''}</button></form>
`
}

const TIPO_ATIV = { entrada: ['Entrada', 'fila'], acao: ['Ação', 'ok'], falha: ['Senha errada', 'alerta'], bloqueio: ['Bloqueado', 'alerta'] }

export function paginaAtividade (itens, { filtro = '', pessoa = '', usuarios = [] } = {}) {
  const q = (tipo, quem) => { const p = new URLSearchParams(); if (tipo) p.set('tipo', tipo); if (quem) p.set('quem', quem.toLowerCase()); return p.size ? '?' + p : '' }
  const aba = (v, t) => `<a href="/atividade${q(v, pessoa)}" class="${filtro === v ? 'atual' : ''}">${t}</a>`
  const chip = (nome, t) => `<a href="/atividade${q(filtro, nome)}" class="chip${pessoa === nome ? ' atual' : ''}">${esc(t)}</a>`
  const linhas = itens.map(i => {
    const [t, cor] = TIPO_ATIV[i.tipo] || [i.tipo, 'neutro']
    const quem = i.tipo === 'falha' || i.tipo === 'bloqueio' ? `tentou “${esc(i.usuario || '?')}”` : esc(i.usuario || '')
    return `<li><span class="selo ${cor}">${t}</span><span class="quem">${quem}</span><span class="tempo">${haQuanto(i.ts)}</span>
<span class="det" style="grid-column:2/-1">${esc(i.texto)}${i.ip ? ` · ${esc(i.ip)}` : ''}</span></li>`
  }).join('')
  return `<div class="chips">${chip('', 'Todos')}${usuarios.map(u => chip(u, u)).join('')}</div>
<div class="periodo">${aba('', 'Tudo')}${aba('acao', 'Ações')}${aba('entrada', 'Entradas')}${aba('falha', 'Falhas')}</div>
<div class="bloco">${linhas ? `<ul class="feed">${linhas}</ul>` : '<p class="suave" style="margin:0">Nada registrado ainda.</p>'}</div>
${linhas ? `<details class="bloco"><summary><b>Limpar atividade</b></summary>
<form method="post" action="/atividade/limpar">
<label for="limpar-oque" style="margin-top:0">O que apagar</label>
<select id="limpar-oque" name="oque">
<option value="falhas">Só as senhas erradas</option>
<option value="7">Tudo com mais de 7 dias</option>
<option value="30">Tudo com mais de 30 dias</option>
<option value="tudo">Tudo</option>
</select>
<div class="acoes"><button class="perigo" data-confirma="Apagar esses registros de atividade? Não dá para desfazer.">Limpar</button></div>
</form></details>` : ''}`
}

const tamanho = b => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`
const dataDoBackup = nome => { const m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})/.exec(nome); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : nome }

export function paginaBackup ({ c, status, rodando, situacao, locais = [], manter = 7 }) {
  const destino = c.backup_remoto || 'gdrive:CartaDex'
  const remoto = destino.split(':')[0]
  const conectado = situacao.instalado && situacao.conectado

  let selo, titulo, detalhe = ''
  if (rodando) { selo = '<span class="selo fila">Em andamento</span>'; titulo = 'Fazendo o backup agora...'; detalhe = 'Na primeira vez as fotos demoram mais para subir.' }
  else if (!status) { selo = '<span class="selo neutro">Nenhum ainda</span>'; titulo = 'Nenhum backup feito ainda' }
  else if (!status.ok) { selo = '<span class="selo alerta">Falhou</span>'; titulo = `Falhou ${quando(status.ts)}`; detalhe = `${esc(status.msg)}. ${status.local ? 'A cópia no servidor foi feita. ' : ''}O bot tenta de novo sozinho daqui a 1 hora.` }
  else if (status.drive === 'ok') { selo = '<span class="selo ok">Em dia</span>'; titulo = `Último backup ${quando(status.ts)}`; detalhe = `Enviado ao Google Drive · banco com ${tamanho(status.tamanho)}` }
  else { selo = '<span class="selo alerta">Só no servidor</span>'; titulo = `Último backup ${quando(status.ts)}`; detalhe = esc(status.msg) }

  const linhaDrive = conectado
    ? `<span class="pilula on"><i></i>Google Drive conectado</span> <span class="suave">${esc(destino)}</span>`
    : `<span class="pilula off"><i></i>Google Drive não conectado</span> <span class="suave">${situacao.instalado ? `falta conectar o "${esc(remoto)}" no rclone` : 'falta instalar o rclone'}</span>`

  return `<div class="bloco">
<div style="display:flex;align-items:center;gap:10px;justify-content:space-between"><b style="font-size:17px">${titulo}</b>${selo}</div>
${detalhe ? `<p class="suave" style="margin:6px 0 0">${detalhe}</p>` : ''}
<p style="margin:12px 0 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">${linhaDrive}</p>
<form method="post" action="/backup/agora" class="acoes"><button class="prim"${rodando ? ' disabled' : ''}>Fazer backup agora</button></form>
${rodando ? '<script>setTimeout(()=>{location.href="/backup"},4000)</script>' : ''}</div>

<p class="suave" style="margin:10px 4px 0">${c.backup_ativo === '1' ? `Automático todo dia a partir das ${Number(c.backup_hora) || 0}h${c.backup_fotos === '1' ? ', com as fotos' : ''}, guardado no Drive por ${esc(c.backup_dias)} dias.` : 'Backup automático desligado.'} <a href="/config/backup">Ajustes ›</a></p>

${conectado ? '' : '<p class="suave" style="margin:10px 4px 0">O passo a passo para conectar o Google Drive está no arquivo <b>GOOGLE-DRIVE.md</b>, na pasta do bot.</p>'}

<h2>Cópias guardadas no servidor <small>as últimas ${manter}</small></h2>
<div class="bloco">${locais.length
    ? `<ul class="feed">${locais.map(l => `<li><span class="selo neutro">${tamanho(l.tamanho)}</span><span class="quem">${dataDoBackup(l.nome)}</span><span></span></li>`).join('')}</ul>`
    : '<p class="suave" style="margin:0">Nenhuma cópia ainda.</p>'}</div>

<details class="bloco"><summary><b>Como restaurar um backup</b></summary>
<ol class="passos">
<li>Desligue o bot.</li>
<li>Na pasta do bot, rode <code class="cmd">npm run restaurar</code>Ele baixa o último backup do Drive, confere se está bom e coloca no lugar. O banco atual não é apagado: fica guardado com o nome <code>pokebot.db.antes-...</code></li>
<li>Sem internet, use a cópia do servidor: <code class="cmd">npm run restaurar -- --local</code></li>
<li>Ligue o bot de novo. Se aparecer QR code, escaneie com o WhatsApp do bot.</li>
</ol></details>`
}

// Hora (de 1 em 1) e minutos (de 5 em 5) lado a lado.
function horaMinuto (nomeH, nomeM, valor, rotulo) {
  const [h, m] = String(valor || '10:00').split(':').map(Number)
  const dois = n => String(n).padStart(2, '0')
  return `<div><label>${rotulo}</label><div class="hora-campos">
<select name="${nomeH}" aria-label="${rotulo}, hora">${Array.from({ length: 24 }, (_, i) => `<option value="${i}"${i === h ? ' selected' : ''}>${dois(i)}h</option>`).join('')}</select>
<select name="${nomeM}" aria-label="${rotulo}, minutos">${Array.from({ length: 12 }, (_, i) => i * 5).map(i => `<option value="${i}"${i === (m || 0) ? ' selected' : ''}>:${dois(i)}</option>`).join('')}</select></div></div>`
}


// ---------- Configurações ----------
const opcaoCfg = c => (nome, texto) => `<label style="display:flex;gap:10px;align-items:center;color:var(--texto);font-size:15px;margin:12px 0 0"><input type="checkbox" name="${nome}" value="1" ${c[nome] === '1' ? 'checked' : ''}> ${texto}</label>`

// Itens da lista: [seção, área, nome, ícone, cor, resumo(c)].
export const SECOES_CONFIG = [
  ['envio', 'Leilão', 'Envio das cartas', 'enviar', ['var(--volt-txt)', 'var(--volt-f)'], c => `A cada ${c.intervalo_min} a ${c.intervalo_max} s${c.fila_pausada === '1' ? ' · fila pausada' : ''}`],
  ['ganhador', 'Leilão', 'Encerramento e ganhador', 'trofeu', ['var(--laranja)', 'var(--laranja-f)'], c => [c.anunciar_resultado === '1' ? 'Anuncia no grupo' : 'Não anuncia', c.ganhador_ativo === '1' ? 'avisa no privado' : 'não avisa no privado'].join(' · ')],
  ['pagamento', 'Dinheiro', 'Pagamento e cobrança', 'cartao', ['var(--ok)', 'var(--ok-f)'], c => [c.mp_ok ? 'Mercado Pago ligado' : 'Sem Mercado Pago', c.cobranca_ativo === '1' ? `lembretes ${String(c.cobranca_horas || '').split(',').join(' e ')}` : 'sem lembretes'].join(' · ')],
  ['rastreio', 'Dinheiro', 'Rastreio das remessas', 'caminhao', ['var(--vivo)', 'var(--vivo-f)'], c => [c.rastreio_ativo === '1' ? 'Manda o código' : 'Não manda o código', c.rastreio_chave ? `confere a cada ${c.rastreio_horas} h` : 'sem leitura automática'].join(' · ')],
  ['grupos', 'Grupos', 'Fechar e abrir os grupos', 'cadeado', ['var(--fila)', 'var(--fila-f)'], c => c.horario_ativo === '1' ? `Fecha ${c.horario_fechar} · abre ${c.horario_abrir}` : 'Desligado'],
  ['/links', 'Grupos', 'Links', 'corrente', ['var(--vivo)', 'var(--vivo-f)'], c => [c.link_ativo === '1' ? 'Loja a cada 1 h' : 'Loja desligada', c.links_ativo === '1' ? 'bloqueio ligado' : 'bloqueio desligado'].join(' · ')],
  ['strikes', 'Proteção', 'Strikes', 'escudo', ['var(--alerta)', 'var(--alerta-f)'], c => c.strikes_ativo === '1' ? `${c.strikes_limite} strikes = bloqueio · prazo ${c.strikes_minutos} min` : 'Desligados'],
  ['backup', 'Sistema', 'Backup', 'backup', ['var(--suave)', 'var(--neutro-f)'], c => c.backup_ativo === '1' ? `Todo dia às ${String(Number(c.backup_hora) || 0).padStart(2, '0')}:00 · ${esc(c.backup_remoto || '')}` : 'Desligado']
]

export function paginaConfigLista (c) {
  const areas = [...new Set(SECOES_CONFIG.map(x => x[1]))]
  return `<p class="suave" style="margin:0 0 4px">Tudo que dá para ajustar no bot, num lugar só. Toque para abrir.</p>
${areas.map(area => `<h2 class="cfg-area">${area}</h2><div class="cfg-lista">${SECOES_CONFIG.filter(x => x[1] === area).map(([sec, , nome, ic, [cor, fundo], resumo]) =>
    `<a href="${sec.startsWith('/') ? sec : '/config/' + sec}" class="cfg-item"><span class="cfg-ico" style="color:${cor};background:${fundo}">${icone(ic, 20)}</span><span style="min-width:0"><b>${nome}</b><small>${resumo(c)}</small></span>${icone('seta', 18)}</a>`).join('')}</div>`).join('')}`
}

export function paginaConfigSecao (secao, c) {
  const opcao = opcaoCfg(c)
  const form = (corpo, rotulo = 'Salvar') => `<form method="post" action="/config/${secao}">${corpo}<button class="prim" style="width:100%;margin-top:14px">${rotulo}</button></form>`
  switch (secao) {
    case 'envio': return form(`<div class="bloco"><p class="suave" style="margin-top:0">O bot espera um tempo aleatório entre uma carta e outra. Intervalos curtos aumentam o risco de o WhatsApp bloquear o número. Com 8 a 15 segundos, 50 cartas levam cerca de 10 minutos.</p>
<div class="linha"><div><label>Mínimo, em segundos</label><input type="number" min="3" name="intervalo_min" value="${esc(c.intervalo_min)}"></div>
<div><label>Máximo, em segundos</label><input type="number" min="3" name="intervalo_max" value="${esc(c.intervalo_max)}"></div></div>
${opcao('fila_pausada', 'Pausar a fila de envio')}</div>
<h2>Prévia</h2>
<div class="bloco"><label for="cfg-previa" style="margin-top:0">Mensagem de abertura padrão</label><textarea id="cfg-previa" name="previa_texto" rows="3">${esc(c.previa_texto)}</textarea>
<p class="suave" style="margin:4px 0 0">{n} vira o número de cartas e {quando} vira o horário do leilão.</p></div>`)
    case 'ganhador': return form(`<h2 style="margin-top:4px">No grupo</h2><div class="bloco">${opcao('anunciar_resultado', 'Anunciar os ganhadores em cada grupo')}
${opcao('apagar_enquete', 'Apagar a enquete do grupo')}
${opcao('apagar_foto', 'Apagar também a foto da carta')}
<p class="suave" style="margin:10px 0 0">O WhatsApp só deixa apagar para todos mensagens com até uns 2 dias, e no lugar fica o aviso "mensagem apagada".</p></div>
<h2>No privado do ganhador</h2>
<div class="bloco">${opcao('ganhador_ativo', 'Avisar o ganhador no privado ao encerrar')}
<p class="suave" style="margin:8px 0 0">O bot manda as fotos das cartas ganhas e, em seguida, a mensagem com o link de pagamento. Quem ganha várias cartas no mesmo encerramento recebe tudo numa conversa só, com o total. O link vem do Mercado Pago (<a href="/config/pagamento">Pagamento</a>) ou do link fixo em <a href="/links">Links</a>.</p>
<label for="cfg-gfotos">Fotos das cartas</label><select id="cfg-gfotos" name="ganhador_fotos"><option value="mural"${c.ganhador_fotos !== 'separadas' ? ' selected' : ''}>Mural: todas numa imagem só</option><option value="separadas"${c.ganhador_fotos === 'separadas' ? ' selected' : ''}>Uma foto por carta</option></select>
<p class="suave" style="margin:4px 0 0">O mural junta as cartas numa grade, com o número e o valor embaixo de cada uma (até 16 por imagem). Com uma carta só, vai a foto normal. Precisa do ImageMagick no servidor; sem ele, o bot manda uma foto por carta.</p>
<label for="cfg-gmsg">Mensagem</label><textarea id="cfg-gmsg" name="ganhador_msg" rows="8">${esc(c.ganhador_msg)}</textarea>
<p class="suave" style="margin:4px 0 0">{nome} vira o primeiro nome, {cartas} as cartas ganhas, {total} o valor total e {link} o link de pagamento. Sem link, a linha do {link} some.</p></div>`)
    case 'pagamento': return form(`<div class="bloco"><p class="suave" style="margin-top:0">Com o Mercado Pago ligado, cada ganhador recebe um link próprio, com o valor certo, para pagar com Pix ou cartão. O bot vê sozinho quando o pagamento cai, para os lembretes e manda a confirmação. Sem ele, vale o link fixo de <a href="/links">Links</a> e você marca como pago em <a href="/pagamentos">Pagamentos</a>.</p>
<label for="cfg-mp">Access Token do Mercado Pago ${c.mp_ok ? '<span class="selo ok">✓ configurado</span>' : '<span class="selo">não configurado</span>'}</label>
<input id="cfg-mp" name="mp_token" type="password" autocomplete="off" placeholder="${c.mp_ok ? 'deixe vazio para manter o atual' : 'APP_USR-...'}">
<p class="suave" style="margin:4px 0 0">No Mercado Pago: mercadopago.com.br/developers → Suas integrações → credenciais de produção → <b>Access Token</b>. Para o Pix aparecer, a conta precisa ter uma chave Pix cadastrada.</p>
<div class="acoes"><button formaction="/config/mp-testar">Salvar e testar o Mercado Pago</button>${c.mp_ok ? opcao('mp_remover', 'Remover o token') : ''}</div>
<label for="cfg-end">Endereço do painel na internet ${c.endereco_publico ? '<span class="selo ok">✓ aviso na hora ligado</span>' : ''}</label>
<input id="cfg-end" name="endereco_publico" value="${esc(c.endereco_publico || '')}" placeholder="https://painel.seudominio.com.br" autocomplete="off" autocapitalize="off" spellcheck="false">
<p class="suave" style="margin:4px 0 0">Com ele, o Mercado Pago avisa o bot no momento em que o pagamento cai, e a confirmação chega em segundos. Vale para os links criados depois de salvar. Sem ele, o bot confere a cada minuto. Na Cloudflare, o caminho <b>/mp/aviso</b> precisa estar liberado do login por e-mail.</p></div>
<h2>Lembretes</h2>
<div class="bloco">${opcao('cobranca_ativo', 'Mandar lembrete para quem não pagou (até pagar ou você parar)')}
<div class="linha">${horaMinuto('cobranca_h1', 'cobranca_m1', String(c.cobranca_horas || '').split(',')[0], '1º lembrete do dia')}
${horaMinuto('cobranca_h2', 'cobranca_m2', String(c.cobranca_horas || '').split(',')[1] || String(c.cobranca_horas || '').split(',')[0], '2º lembrete do dia')}</div>
<p class="suave" style="margin:4px 0 0">Quando bate o horário, o bot manda na hora para todo mundo que ainda não pagou (em até uns 20 segundos). Só não cobra quem ganhou depois daquele horário: essa pessoa entra no próximo. Muitas mensagens para quem não responde podem fazer o WhatsApp bloquear o número; em <a href="/pagamentos">Pagamentos</a> dá para parar a cobrança de alguém.</p>
<label for="cfg-lemb">Mensagem do lembrete</label><textarea id="cfg-lemb" name="cobranca_msg" rows="6">${esc(c.cobranca_msg)}</textarea></div>
<h2>Confirmação</h2>
<div class="bloco">${opcao('cobranca_avisar_pago', 'Mandar confirmação quando o pagamento cair')}
<label for="cfg-pago">Mensagem de confirmação</label><textarea id="cfg-pago" name="cobranca_msg_pago" rows="3">${esc(c.cobranca_msg_pago)}</textarea>
<p class="suave" style="margin:4px 0 0">Valem os mesmos {nome}, {cartas}, {total} e {link}.</p></div>`)
    case 'rastreio': return form(`<div class="bloco">${opcao('rastreio_ativo', 'Mandar o código de rastreio para o comprador ao salvar a remessa')}
<label for="cfg-rmsg">Mensagem com o código</label><textarea id="cfg-rmsg" name="rastreio_msg" rows="6">${esc(c.rastreio_msg)}</textarea>
<label for="cfg-rlink">Link de acompanhamento</label><input id="cfg-rlink" name="rastreio_link" value="${esc(c.rastreio_link)}" autocapitalize="off" spellcheck="false">
<p class="suave" style="margin:4px 0 0">{codigo} vira o código. Na mensagem valem {nome}, {codigo}, {link} e {cartas}.</p></div>
<h2>Leitura automática das atualizações</h2>
<div class="bloco"><p class="suave" style="margin-top:0">O bot consulta o rastreio pelo PacoteVício (Correios, Total Express e Anjun). O plano grátis dá 1.000 consultas por mês: crie uma conta em rapidapi.com, procure por <b>PacoteVício</b>, assine o plano <b>Basic</b> (grátis) e copie a <b>X-RapidAPI-Key</b>. Jadlog, Loggi e outras ficam sem leitura automática: o bot só manda o código.</p>
<label for="cfg-rkey">Chave (X-RapidAPI-Key) ${c.rastreio_chave ? '<span class="selo ok">✓ configurada</span>' : '<span class="selo">não configurada</span>'}</label>
<input id="cfg-rkey" name="rastreio_chave_nova" type="password" autocomplete="off" placeholder="${c.rastreio_chave ? 'deixe vazio para manter a atual' : 'cole a chave aqui'}">
${c.rastreio_chave ? opcao('rastreio_remover', 'Remover a chave') : ''}
<div class="linha"><div><label>Conferir cada remessa a cada</label><select name="rastreio_horas">${[2, 4, 6, 8, 12, 24].map(h => `<option value="${h}"${Number(c.rastreio_horas) === h ? ' selected' : ''}>${h} horas</option>`).join('')}</select></div>
<div><label>Avisar o comprador</label><select name="rastreio_avisar">${[['marcos', 'A cada etapa'], ['tudo', 'A cada movimentação'], ['nada', 'Não avisar']].map(([v, t]) => `<option value="${v}"${c.rastreio_avisar === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
<p class="suave" style="margin:4px 0 0">Etapas: postado, a caminho, saiu para entrega, aguardando retirada, entregue ou problema. Quando chega em "entregue", a remessa muda sozinha para Entregue e o bot para de consultar. Com 6 horas, cada encomenda gasta umas 4 consultas por dia.</p>
<label for="cfg-rmov">Mensagem de atualização</label><textarea id="cfg-rmov" name="rastreio_msg_mov" rows="4">${esc(c.rastreio_msg_mov)}</textarea>
<p class="suave" style="margin:4px 0 0">{evento} vira a movimentação (ex.: "Objeto saiu para entrega ao destinatário") e {local} a cidade.</p></div>`)
    case 'grupos': return `<form method="post" action="/conexao/horario"><div class="bloco">
<label style="display:flex;gap:10px;align-items:center;color:var(--texto);font-size:15px;margin:0"><input type="checkbox" name="horario_ativo" value="1" ${c.horario_ativo === '1' ? 'checked' : ''}> Fechar e abrir os grupos sozinho todo dia</label>
<div class="linha">${campoHora('horario_fechar', c.horario_fechar, 'Fechar às')}${campoHora('horario_abrir', c.horario_abrir, 'Abrir às')}</div>
<label for="h-msg-f">Mensagem ao fechar <span class="suave">(opcional)</span></label><textarea id="h-msg-f" name="horario_msg_fechar" rows="2">${esc(c.horario_msg_fechar)}</textarea>
<label for="h-msg-a">Mensagem ao abrir <span class="suave">(opcional)</span></label><textarea id="h-msg-a" name="horario_msg_abrir" rows="2">${esc(c.horario_msg_abrir)}</textarea>
<p class="suave" style="margin:4px 0 0">{abre} vira o horário de abrir. Vale para todos os grupos do leilão em que o bot é administrador. Fechado, só os administradores mandam mensagem. Para fechar ou abrir agora, use <a href="/grupos">Grupos</a>.</p></div>
<button class="prim" style="width:100%;margin-top:14px">Salvar horário</button></form>`
    case 'strikes': return form(`<div class="bloco">${opcao('strikes_ativo', 'Dar strike em quem tira o lance depois do prazo')}
<div class="linha"><div><label>Prazo para tirar sem strike</label><select name="strikes_minutos">${[1, 2, 3, 5, 10, 15].map(m => `<option value="${m}"${Number(c.strikes_minutos) === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></div>
<div><label>Bloquear com</label><select name="strikes_limite">${[2, 3, 4, 5, 6, 8, 10].map(m => `<option value="${m}"${Number(c.strikes_limite) === m ? ' selected' : ''}>${m} strikes</option>`).join('')}</select></div></div>
<p class="suave" style="margin:10px 0 0">Trocar de lance nunca dá strike. Quem é bloqueado tem os votos ignorados até ser desbloqueado em <a href="/punicoes">Strikes e bloqueios</a>.</p></div>`)
    case 'backup': {
      const horas = Array.from({ length: 24 }, (_, h) => `<option value="${h}"${Number(c.backup_hora) === h ? ' selected' : ''}>${h}h</option>`).join('')
      const dias = [7, 15, 30, 60, 90].map(d => `<option value="${d}"${Number(c.backup_dias) === d ? ' selected' : ''}>${d} dias</option>`).join('')
      const destino = c.backup_remoto || 'gdrive:CartaDex'
      return `<form method="post" action="/backup"><div class="bloco">
${opcao('backup_ativo', 'Fazer backup automático todo dia')}
<div class="linha"><div><label for="b-hora">A partir de</label><select id="b-hora" name="backup_hora">${horas}</select></div>
<div><label for="b-dias">Guardar no Drive por</label><select id="b-dias" name="backup_dias">${dias}</select></div></div>
<label for="b-remoto">Pasta no Google Drive</label><input id="b-remoto" name="backup_remoto" value="${esc(destino)}" autocomplete="off" autocapitalize="off" spellcheck="false">
${opcao('backup_fotos', 'Enviar também as fotos das cartas')}
<p class="suave" style="margin:12px 0 0">Vão para o backup: lotes, cartas, lances, vendas, remessas, grupos e configurações. Por segurança, o login do WhatsApp e as senhas do painel ficam de fora. Para fazer um backup agora, use <a href="/backup">Backup</a>.</p></div>
<button class="prim" style="width:100%;margin-top:14px">Salvar backup</button></form>`
    }
    default: return '<div class="bloco">Seção não encontrada. <a href="/config">Voltar</a></div>'
  }
}
