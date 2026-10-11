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
