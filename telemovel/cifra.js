// Decifra o resumo enviado pelo computador (myfinance/phone.py). Igual nos dois lados: PBKDF2-SHA256 → AES-GCM.
const enc = new TextEncoder();
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const AAD_KEY = enc.encode("tiodino-chave-v1"), AAD_DATA = enc.encode("tiodino-telemovel-v1");

export const normCode = s => String(s || "").normalize("NFC").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");

async function unwrap(w, secret, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(w.salt), iterations: iter },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(w.iv), additionalData: AAD_KEY }, kek, b64(w.ct));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

// Tenta a palavra-passe e depois o código de recuperação; erro único se nenhum abrir (sem dados parciais)
export async function unlock(fileText, chaveText, secret) {
  let chave, sealed;
  try { chave = JSON.parse(chaveText); sealed = JSON.parse(fileText); } catch { throw new Error("Ficheiros inválidos."); }
  let key = null;
  for (const [which, s] of [["password", String(secret || "").normalize("NFC")], ["code", normCode(secret)]]) {
    try { key = await unwrap(chave[which], s, chave.iter); break; } catch { }
  }
  try {
    if (!key) throw 0;
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(sealed.iv), additionalData: AAD_DATA }, key, b64(sealed.ct));
    const text = await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(text);
  } catch { throw new Error("Palavra-passe errada ou ficheiro diferente."); }
}

// ---------------------------------------------------------------- caixa cifrada (opção A)
const AAD_IN = enc.encode("tiodino-entrada-v1");
const toB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

async function unwrapRaw(w, secret, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(w.salt), iterations: iter },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(w.iv), additionalData: AAD_KEY }, kek, b64(w.ct));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt", "encrypt"]);
}

// Chave de dados a partir da palavra-passe (ou do código de recuperação); serve para abrir o resumo e cifrar as entradas
export async function keyFrom(chaveText, secret) {
  let chave; try { chave = JSON.parse(chaveText); } catch { throw new Error("Chave inválida."); }
  for (const [which, s] of [["password", String(secret || "").normalize("NFC")], ["code", normCode(secret)]]) {
    try { return await unwrapRaw(chave[which], s, chave.iter); } catch { }
  }
  throw new Error("Palavra-passe errada.");
}

export async function openSnapshot(key, sealedText) {
  const sealed = JSON.parse(sealedText);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(sealed.iv), additionalData: AAD_DATA }, key, b64(sealed.ct));
  return JSON.parse(await new Response(new Blob([pt]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}

// Entrada para o computador (fatura, despesa, classificação): JSON → gzip → AES-GCM (igual a phone.seal_entry)
export async function sealEntry(key, obj) {
  const gz = new Uint8Array(await new Response(new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD_IN }, key, gz));
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}
