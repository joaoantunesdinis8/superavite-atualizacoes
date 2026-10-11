// Tio Dino no iPhone: só consulta. Abre o resumo cifrado que o computador grava na iCloud Drive (telemovel.tiodino +
// chave.json). Os ficheiros ficam cifrados no IndexedDB; a palavra-passe pede-se sempre ao abrir e nunca é guardada.
import { unlock } from "./cifra.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (v, cur = "EUR") => v == null ? "—" : `<span class="v">${Number(v).toLocaleString("pt-PT", { style: "currency", currency: cur || "EUR" })}</span>`;
const pct = v => v == null ? "—" : `<span class="v ${v < 0 ? "neg" : "pos"}">${v > 0 ? "+" : ""}${Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</span>`;
const share = v => v == null ? "—" : `${Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}%`;   // parte do limite usada
let SNAP = null, TAB = "painel", SPACE = "pessoal", Q = "", MONTH = "";

function idb() {
  return new Promise((ok, no) => { const r = indexedDB.open("tiodino", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
}
async function store(op, val) {
  const db = await idb();
  return new Promise((ok, no) => {
    const t = db.transaction("f", op === "get" ? "readonly" : "readwrite").objectStore("f");
    const r = op === "get" ? t.get("pair") : op === "del" ? t.delete("pair") : t.put(val, "pair");
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}

function welcome(msg = "") {
  $("#tabs").hidden = true; $("#when").textContent = "";
  $("#main").innerHTML = `<section class="card"><h2>Ver as suas finanças</h2>
    <p>No computador: Definições → «📱 Ver no telemóvel». Depois toque em <b>Atualizar</b> e escolha os dois ficheiros
    da pasta <b>Tio Dino</b> na iCloud Drive (<i>telemovel.tiodino</i> e <i>chave.json</i>).</p>
    ${msg ? `<p class="neg">${esc(msg)}</p>` : ""}<button class="btn primary" id="pick">Atualizar</button></section>`;
  $("#pick").onclick = () => $("#files").click();
}

function askPassword(pair, msg = "") {
  $("#tabs").hidden = true; $("#when").textContent = "";
  $("#main").innerHTML = `<section class="card"><h2>Palavra-passe</h2><p>A mesma do Tio Dino no computador (ou o código de recuperação).</p>
    ${msg ? `<p class="neg">${esc(msg)}</p>` : ""}
    <form id="pwf"><input type="password" id="pw" autocomplete="current-password" autofocus>
    <button class="btn primary" id="go">Abrir</button></form>
    <p><button class="btn" id="pick">Atualizar ficheiros</button></p>
    <small>Ficheiros guardados neste telemóvel em ${esc(new Date(pair.saved).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }))}.</small></section>`;
  $("#pick").onclick = () => $("#files").click();
  $("#pwf").onsubmit = async e => {
    e.preventDefault(); $("#go").disabled = true; $("#go").textContent = "A abrir…";
    try { SNAP = await unlock(pair.file, pair.chave, $("#pw").value); render(); }
    catch (x) { askPassword(pair, x.message); }
  };
}

$("#files").onchange = async () => {
  const texts = await Promise.all([...$("#files").files].map(f => f.text()));
  $("#files").value = "";
  const chave = texts.find(t => t.includes('"kdf"')), file = texts.find(t => !t.includes('"kdf"') && t.includes('"ct"'));
  if (!chave || !file) return welcome("Escolha os dois ficheiros: telemovel.tiodino e chave.json.");
  const pair = { file, chave, saved: new Date().toISOString() };
  try { await store("put", pair); } catch { }
  askPassword(pair);
};

function render() {
  $("#tabs").hidden = false;
  $("#when").textContent = `dados de ${new Date(SNAP.generated).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}`;
  const spaces = Object.keys(SNAP.spaces || {});
  if (!spaces.includes(SPACE)) SPACE = spaces[0] || "pessoal";
  const sw = spaces.length > 1 ? `<div class="seg">${spaces.map(s => `<button data-s="${s}" class="${s === SPACE ? "on" : ""}">${s === "pessoal" ? "Pessoal" : "Empresa"}</button>`).join("")}</div>` : "";
  const sp = SNAP.spaces?.[SPACE] || {};
  const view = { painel, mov, orc, cart }[TAB];
  $("#main").innerHTML = (TAB === "cart" ? "" : sw) + view(sp);
  document.querySelectorAll("[data-w]").forEach(i => i.style.width = i.dataset.w + "%");   // CSP: sem estilos inline
  document.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { SPACE = b.dataset.s; render(); });
  const q = $("#q"); if (q) q.oninput = () => { Q = q.value; const pos = q.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); };
  const m = $("#m"); if (m) m.onchange = () => { MONTH = m.value; render(); };
}

function painel(sp) {
  const y = new Date(SNAP.generated).getFullYear(), cur = sp.years?.[y] || {}, prev = sp.years?.[y - 1] || {};
  const t = cur.totals || {}, p = prev.totals || {};
  const cats = Object.entries(cur.by_category_total || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<section class="kpis">
    <div><small>Receitas ${y}</small>${eur(t.income)}<small>${y - 1}: ${eur(p.income)}</small></div>
    <div><small>Despesas ${y}</small>${eur(t.expenses)}<small>${y - 1}: ${eur(p.expenses)}</small></div>
    <div><small>Poupança ${y}</small>${eur(t.savings)}<small>${y - 1}: ${eur(p.savings)}</small></div>
    ${sp.net_worth == null ? "" : `<div><small>Património</small>${eur(sp.net_worth)}</div>`}</section>
    <section class="card"><h2>Onde gastou em ${y}</h2>${cats.map(([c, v]) => `<div class="li"><span>${esc(c)}</span>${eur(v)}</div>`).join("") || "<p>Sem despesas.</p>"}</section>`;
}

function mov(sp) {
  const all = sp.transactions || [];
  const months = [...new Set(all.map(t => t.date.slice(0, 7)))];
  const q = Q.trim().toLowerCase();
  const rows = all.filter(t => (!MONTH || t.date.startsWith(MONTH)) &&
    (!q || `${t.display || ""} ${t.description} ${t.category || ""} ${t.account}`.toLowerCase().includes(q))).slice(0, 300);
  return `<section class="card"><input id="q" type="search" placeholder="Pesquisar" value="${esc(Q)}">
    <select id="m"><option value="">Todos os meses</option>${months.map(m => `<option ${m === MONTH ? "selected" : ""}>${m}</option>`).join("")}</select></section>
    <section class="card">${rows.map(t => `<div class="li"><span><b>${esc(t.display || t.description)}</b><small>${esc(t.date)} · ${esc(t.category || "sem categoria")} · ${esc(t.account)}</small></span>
      <span class="${(t.eur ?? t.amount) < 0 ? "neg" : "pos"}">${eur(t.eur ?? t.amount, t.eur == null ? t.currency : "EUR")}</span></div>`).join("") || "<p>Nada encontrado.</p>"}</section>`;
}

function orc(sp) {
  const block = (title, b) => `<section class="card"><h2>${title}</h2>${(b?.items || []).filter(i => i.limit).map(i => `
    <div class="li"><span>${esc(i.emoji)} ${esc(i.category)}<small>${eur(i.spent)} de ${eur(i.limit)}</small></span><span class="${i.state === "excedido" ? "neg" : ""}">${share(i.pct)}</span></div>
    <div class="bar"><i data-w="${Math.min(100, i.pct || 0)}" class="${esc(i.state || "")}"></i></div>`).join("") || "<p>Sem orçamentos definidos.</p>"}</section>`;
  return block("Este mês", sp.budgets?.month) + block("Este ano", sp.budgets?.year);
}

function cart() {
  const p = SNAP.portfolio;
  if (!p) return `<section class="card"><p>Sem carteira de investimentos.</p></section>`;
  const t = p.totals || {};
  return `<section class="kpis"><div><small>Valor</small>${eur(t.value, p.currency)}</div>
    <div><small>Ganho não realizado</small>${eur(t.unrealized, p.currency)}<small>${pct(t.unrealized_pct)}</small></div>
    <div><small>Hoje</small>${eur(t.day_change, p.currency)}</div><div><small>Dividendos 12 m</small>${eur(t.dividends_12m, p.currency)}</div></section>
    <section class="card">${p.positions.map(x => `<div class="li"><span><b>${esc(x.name)}</b><small>${esc(x.symbols)} · ${x.qty} × ${eur(x.price, x.price_currency || p.currency)}</small></span>
      <span>${eur(x.value, p.currency)}<small>${pct(x.gain_pct)}</small></span></div>`).join("")}</section>`;
}

document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  TAB = b.dataset.t; document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b)); render();
});
$("#priv").onclick = () => document.body.classList.toggle("priv");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
store("get").then(pair => pair ? askPassword(pair) : welcome()).catch(() => welcome());
