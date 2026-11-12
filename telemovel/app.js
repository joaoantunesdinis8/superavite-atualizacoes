// Tio Dino no telemóvel com os dados do computador. Duas formas: (1) caixa cifrada do Tio Dino — emparelha com um código
// curto, vai buscar o resumo cifrado ao servidor e ENVIA entradas cifradas (faturas, despesas, classificações) que o
// computador junta; (2) ficheiros da iCloud Drive escolhidos à mão (só consulta). O servidor só vê blocos cifrados; a
// palavra-passe pede-se ao abrir e nunca é guardada nem enviada.
import { unlock, keyFrom, openSnapshot, sealEntry } from "./cifra.js";
const SERVER = "https://tio-dino-licencas.tiodino10.workers.dev";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (v, cur = "EUR") => v == null ? "—" : `<span class="v">${Number(v).toLocaleString("pt-PT", { style: "currency", currency: cur || "EUR" })}</span>`;
const pct = v => v == null ? "—" : `<span class="v ${v < 0 ? "neg" : "pos"}">${v > 0 ? "+" : ""}${Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</span>`;
const share = v => v == null ? "—" : `${Number(v).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}%`;   // parte do limite usada
let SNAP = null, TAB = "painel", SPACE = "pessoal", Q = "", MONTH = "", KEY = null, TODO = false, SENT = new Set();

function idb() {
  return new Promise((ok, no) => { const r = indexedDB.open("tiodino", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
}
async function store(op, val, name = "pair") {
  const db = await idb();
  return new Promise((ok, no) => {
    const t = db.transaction("f", op === "get" ? "readonly" : "readwrite").objectStore("f");
    const r = op === "get" ? t.get(name) : op === "del" ? t.delete(name) : t.put(val, name);
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}

function welcome(msg = "") {
  $("#tabs").hidden = true; $("#when").textContent = "";
  $("#main").innerHTML = `<section class="card"><h2>Ligar ao computador</h2>
    <p>No computador: Definições → «Ver no telemóvel» → <b>Ligar o telemóvel</b> (ou «Código para ligar um telemóvel»). Aparece um código de 8 letras.</p>
    ${msg ? `<p class="neg">${esc(msg)}</p>` : ""}
    <form id="parf"><input id="pcode" placeholder="Código (ex.: ABCD 2345)" autocomplete="off" autocapitalize="characters">
    <input type="password" id="ppw" placeholder="Palavra-passe do Tio Dino" autocomplete="current-password">
    <button class="btn primary" id="pgo">Ligar</button></form></section>
    <details class="card"><summary>Em alternativa: ficheiros da iCloud Drive (só consulta)</summary>
    <ol class="steps"><li>No computador: Definições → «Ver no telemóvel» → ligar pela pasta.</li>
    <li>Aqui, toque em <b>Atualizar</b>. Abre-se a app Ficheiros.</li>
    <li>Vá a <b>iCloud Drive → Tio Dino</b> e escolha <i>telemovel.tiodino</i> e <i>chave.json</i> (pode escolher um de cada vez).</li>
    <li>Escreva a palavra-passe do Tio Dino.</li></ol>
    <button class="btn" id="pick">Atualizar</button></details>`;
  $("#pick").onclick = () => $("#files").click();
  $("#parf").onsubmit = async e => {
    e.preventDefault(); $("#pgo").disabled = true; $("#pgo").textContent = "A ligar…";
    try {
      const r = await fetch(SERVER + "/v1/emparelhar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo: $("#pcode").value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Não consegui ligar.");
      await store("put", { box: d.caixa, token: d.token }, "caixa");
      await cloudOpen($("#ppw").value);
    } catch (x) { welcome(x.message === "Failed to fetch" ? "Sem internet. Tente outra vez." : x.message); }
  };
}

// ---------------------------------------------------------------- caixa cifrada
async function box(path, opt = {}) {
  const c = await store("get", undefined, "caixa");
  const r = await fetch(`${SERVER}/v1/caixa/${c.box}/${path}`, { ...opt, headers: { "content-type": "application/json", authorization: "Bearer " + c.token } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { await store("del", undefined, "caixa"); throw new Error("Este telemóvel foi desligado no computador. Ligue-o outra vez com um código novo."); }
  if (!r.ok) throw new Error(d.erro || `Erro ${r.status}.`);
  return d;
}
async function cloudOpen(pw) {
  let cache = null; try { cache = await store("get", undefined, "cache"); } catch { }
  let resumo = cache?.resumo, chave = cache?.chave, offline = false;
  try {
    [chave, resumo] = [(await box("chave")).dados, (await box("resumo")).dados];
    await store("put", { resumo, chave, at: new Date().toISOString() }, "cache");
  } catch (x) { if (!resumo || /desligado/.test(x.message)) throw x; offline = true; }
  KEY = await keyFrom(chave, pw);
  SNAP = await openSnapshot(KEY, resumo);
  SNAP.offline = offline;
  render();
}
function askCloud(msg = "") {
  $("#tabs").hidden = true; $("#when").textContent = "";
  $("#main").innerHTML = `<section class="card"><h2>Palavra-passe</h2><p>A mesma do Tio Dino no computador (ou o código de recuperação).</p>
    ${msg ? `<p class="neg">${esc(msg)}</p>` : ""}
    <form id="pwf"><input type="password" id="pw" autocomplete="current-password" autofocus><button class="btn primary" id="go">Abrir</button></form>
    <p><button class="btn" id="unpair">Desligar este telemóvel</button></p></section>`;
  $("#unpair").onclick = async () => { await store("del", undefined, "caixa"); await store("del", undefined, "cache"); welcome(); };
  $("#pwf").onsubmit = async e => {
    e.preventDefault(); $("#go").disabled = true; $("#go").textContent = "A abrir…";
    try { await cloudOpen($("#pw").value); } catch (x) { x.message.includes("desligado") ? welcome(x.message) : askCloud(x.message); }
  };
}
async function send(tipo, dados) {
  const sealed = await sealEntry(KEY, { v: 1, tipo, at: new Date().toISOString(), dados });
  await box("entrada", { method: "POST", body: JSON.stringify({ dados: JSON.stringify(sealed) }) });
}
async function photo(file) {      // fotografia reduzida (até 1600 px, JPEG) para não pesar; PDF vai como está
  if (file.type === "application/pdf") return { name: file.name, mime: "application/pdf", blob: file };
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.8));
  return { name: (file.name || "fatura").replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", blob };
}
const blobB64 = async b => { const u8 = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

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
    catch (x) { askPassword(pair, x.message + " Mudou a palavra-passe ou o código no computador? Toque em «Atualizar ficheiros» e escolha os dois ficheiros novos."); }
  };
}

$("#files").onchange = async () => {
  const texts = await Promise.all([...$("#files").files].map(f => f.text()));
  $("#files").value = "";
  const chave = texts.find(t => t.includes('"kdf"')), file = texts.find(t => !t.includes('"kdf"') && t.includes('"ct"'));
  if (!chave && !file) return welcome("Esses ficheiros não são do Tio Dino. Escolha telemovel.tiodino e chave.json.");
  let old = null; try { old = await store("get"); } catch { }
  const pair = { file: file || old?.file, chave: chave || old?.chave, saved: new Date().toISOString() };
  try { await store("put", pair); } catch { }
  if (!pair.file) return welcome("Já tenho a chave.json. Falta o ficheiro telemovel.tiodino: toque em Atualizar e escolha-o.");
  if (!pair.chave) return welcome("Já tenho o telemovel.tiodino. Falta o ficheiro chave.json: toque em Atualizar e escolha-o.");
  askPassword(pair);
};

function render() {
  $("#tabs").hidden = false;
  document.querySelectorAll("#tabs [data-cloud]").forEach(b => b.hidden = !KEY);
  $("#when").textContent = `${SNAP.offline ? "sem internet · " : ""}dados de ${new Date(SNAP.generated).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}`;
  const spaces = Object.keys(SNAP.spaces || {});
  if (!spaces.includes(SPACE)) SPACE = spaces[0] || "pessoal";
  const sw = spaces.length > 1 ? `<div class="seg">${spaces.map(s => `<button data-s="${s}" class="${s === SPACE ? "on" : ""}">${s === "pessoal" ? "Pessoal" : "Empresa"}</button>`).join("")}</div>` : "";
  const sp = SNAP.spaces?.[SPACE] || {};
  const view = { painel, mov, orc, cart, mais, enviar }[TAB];
  $("#main").innerHTML = (TAB === "cart" ? "" : sw) + view(sp);
  document.querySelectorAll("[data-w]").forEach(i => i.style.width = i.dataset.w + "%");   // CSP: sem estilos inline
  document.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { SPACE = b.dataset.s; render(); });
  const q = $("#q"); if (q) q.oninput = () => { Q = q.value; const pos = q.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); };
  const m = $("#m"); if (m) m.onchange = () => { MONTH = m.value; render(); };
  const td = $("#todo"); if (td) td.onclick = () => { TODO = !TODO; render(); };
  document.querySelectorAll("[data-cls]").forEach(sel => sel.onchange = async () => {
    if (!sel.value) return;
    sel.disabled = true;
    try { await send("classificar", { tx_id: +sel.dataset.cls, category: sel.value, space: SPACE }); SENT.add(+sel.dataset.cls); render(); }
    catch (x) { alertMsg(x.message); sel.disabled = false; }
  });
  bindEnviar();
}
function alertMsg(t) { const el = $("#msg"); if (el) { el.textContent = t; el.hidden = false; } }

function painel(sp) {
  const y = new Date(SNAP.generated).getFullYear(), cur = sp.years?.[y] || {}, prev = sp.years?.[y - 1] || {};
  const t = cur.totals || {}, p = prev.totals || {};
  const cats = Object.entries(cur.by_category_total || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<section class="kpis">
    <div><small>Receitas ${y}</small>${eur((t.income || 0) + (t.invest_income || 0))}<small>${y - 1}: ${eur((p.income || 0) + (p.invest_income || 0))}</small></div>
    <div><small>Despesas ${y}</small>${eur(t.expenses)}<small>${y - 1}: ${eur(p.expenses)}</small></div>
    <div><small>Poupança ${y}</small>${eur(t.savings)}<small>${y - 1}: ${eur(p.savings)}</small></div>
    ${sp.net_worth == null ? "" : `<div><small>Património</small>${eur(sp.net_worth)}${(sp.net_worth_missing || []).length ? `<small class="parcial">◐ parcial: sem saldo de ${esc(sp.net_worth_missing.join(", "))}</small>` : ""}</div>`}</section>
    <section class="card"><h2>Onde gastou em ${y}</h2>${cats.map(([c, v]) => `<div class="li"><span>${esc(c)}</span>${eur(v)}</div>`).join("") || "<p>Sem despesas.</p>"}</section>`;
}

function mov(sp) {
  const all = sp.transactions || [];
  const months = [...new Set(all.map(t => t.date.slice(0, 7)))];
  const q = Q.trim().toLowerCase();
  const rows = all.filter(t => (!TODO || ((t.status === "review" || t.status === "pending" || t.kind === "unknown") && !SENT.has(t.id))) && (!MONTH || t.date.startsWith(MONTH)) &&
    (!q || `${t.display || ""} ${t.description} ${t.category || ""} ${t.account}`.toLowerCase().includes(q))).slice(0, 300);
  return `<section class="card"><input id="q" type="search" placeholder="Pesquisar" value="${esc(Q)}">
    <select id="m"><option value="">Todos os meses</option>${months.map(m => `<option ${m === MONTH ? "selected" : ""}>${m}</option>`).join("")}</select>
    ${KEY ? `<button class="btn ${TODO ? "primary" : ""}" id="todo">Por rever</button>` : ""}<p id="msg" class="neg" hidden></p></section>
    <section class="card">${rows.map(t => `<div class="li"><span><b>${esc(t.display || t.description)}</b><small>${esc(t.date)} · ${esc(t.category || "sem categoria")} · ${esc(t.account)}${SENT.has(t.id) ? " · ✓ enviado" : ""}</small>
      ${KEY && t.id && !SENT.has(t.id) && (t.status === "review" || t.status === "pending" || t.kind === "unknown") ? `<select data-cls="${t.id}"><option value="">Classificar…</option>${((sp.categories || {})[(t.eur ?? t.amount) < 0 ? "expense" : "income"] || []).map(c => `<option>${esc(c)}</option>`).join("")}</select>` : ""}</span>
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

function mais(sp) {
  const ev = (sp.events || []).slice(0, 25);
  const money = c => eur((c || 0) / 100);
  return `<section class="card"><h2>Próximos 60 dias</h2>${ev.map(e => `<div class="li"><span>${esc(e.title)}<small>${esc(e.date)}</small></span>${e.amount == null ? "<span></span>" : eur(e.amount)}</div>`).join("") || "<p>Nada previsto.</p>"}</section>
    ${sp.partner ? `<section class="kpis"><div><small>A empresa deve ao sócio</small>${eur(sp.partner.company_owes)}</div><div><small>O sócio deve à empresa</small>${eur(sp.partner.partner_owes)}</div></section>` : ""}
    ${sp.receivables ? `<section class="card"><h2>Faturas por receber</h2>${sp.receivables.map(r => `<div class="li"><span>${esc(r.client)}<small>${esc(r.number || "")} · vence ${esc(r.due_date)}</small></span>${money(r.amount_cents)}</div>`).join("") || "<p>Nenhuma.</p>"}</section>` : ""}
    ${sp.invoices_open ? `<section class="card"><h2>Faturas recebidas sem pagamento</h2>${sp.invoices_open.slice(0, 40).map(r => `<div class="li"><span>${esc(r.supplier || "—")}<small>${esc(r.number || "")} · ${esc(r.date || "")}</small></span>${money(r.total_cents)}</div>`).join("") || "<p>Nenhuma.</p>"}</section>` : ""}
    ${sp.contracts ? `<section class="card"><h2>Contratos</h2>${sp.contracts.map(c => `<div class="li"><span>${esc(c.title)}<small>${esc(c.kind_label)}${c.end_date ? " · até " + esc(c.end_date) : ""}${c.auto_renew ? " · renova-se" : ""}</small></span>${c.to_pay ? eur(c.to_pay) : "<span></span>"}</div>`).join("") || "<p>Nenhum.</p>"}</section>` : ""}`;
}

function enviar(sp) {
  const today = new Date().toISOString().slice(0, 10);
  return `<p id="msg" class="neg" hidden></p><p id="ok" class="pos" hidden></p>
    <section class="card"><h2>Fatura ou recibo</h2><p><small>Tire uma fotografia ou escolha um PDF. Entra em Faturas no computador (${SPACE === "empresa" ? "Empresa" : "Pessoal"}), por rever.</small></p>
      <label class="btn primary" for="ffoto">📷 Fotografar ou escolher</label><input type="file" id="ffoto" accept="image/*,application/pdf" capture="environment" hidden></section>
    <section class="card"><h2>Despesa ${SPACE === "empresa" ? "da empresa" : ""} em dinheiro</h2>
      <form id="dform"><input type="date" id="dd" value="${today}" max="${today}"><input id="dt" placeholder="Descrição (ex.: café com cliente)" required>
      <input id="dv" inputmode="decimal" placeholder="Valor em € (ex.: 3,20)" required>
      <select id="dc"><option value="">Categoria (automática)</option>${((sp.categories || {}).expense || []).map(c => `<option>${esc(c)}</option>`).join("")}</select>
      <button class="btn primary" id="dgo">Enviar despesa</button></form></section>
    <section class="card"><small>Tudo vai cifrado com a sua palavra-passe e entra no computador da próxima vez que a app estiver aberta.</small></section>`;
}
function bindEnviar() {
  const ok = t => { const el = $("#ok"); if (el) { el.textContent = t; el.hidden = false; } };
  const f = $("#ffoto");
  if (f) f.onchange = async () => {
    const file = f.files[0]; f.value = ""; if (!file) return;
    ok("A enviar…");
    try { const p = await photo(file); if (p.blob.size > 6e6) throw new Error("Ficheiro grande demais (máx. 6 MB).");
      await send("fatura", { space: SPACE, name: p.name, mime: p.mime, b64: await blobB64(p.blob) }); ok("✓ Fatura enviada para o computador."); }
    catch (x) { alertMsg(x.message); }
  };
  const d = $("#dform");
  if (d) d.onsubmit = async e => {
    e.preventDefault();
    try { await send("despesa", { space: SPACE, date: $("#dd").value, description: $("#dt").value, amount: $("#dv").value, category: $("#dc").value || null });
      d.reset(); $("#dd").value = new Date().toISOString().slice(0, 10); ok("✓ Despesa enviada para o computador."); }
    catch (x) { alertMsg(x.message); }
  };
}

document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  TAB = b.dataset.t; document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b)); render();
});
$("#priv").onclick = () => document.body.classList.toggle("priv");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
(async () => {
  try { if (await store("get", undefined, "caixa")) return askCloud(); } catch { }
  store("get").then(pair => pair && pair.file && pair.chave ? askPassword(pair)
    : welcome(pair ? (pair.file ? "Falta o ficheiro chave.json." : "Falta o ficheiro telemovel.tiodino.") : "")).catch(() => welcome());
})();
