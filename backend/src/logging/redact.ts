/**
 * Log tozalash (redaction). Maqsad: parol, token, Telegram initData, sirlar va to'lovning maxfiy ma'lumotlari log'ga HECH QACHON tushmasin.
 * Ikki himoya qatlami: (1) KALIT bo'yicha (password, token, initData...) qiymat butunlay yashiriladi;
 * (2) QIYMAT bo'yicha (matn ichida Bearer/JWT/bot token/initData/DB parol) naqsh topilsa yashiriladi, kalit nomi bezarar bo'lsa ham.
 * Funksiyalar sof (hech narsaga bog'liq emas), shuning uchun mustaqil test qilinadi.
 */
export const REDACTED = "[REDACTED]";

const MAX_STRING = 500;
const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ITEMS = 50;

/** Kalit nomi (kichik harf, harf-raqamdan boshqa belgilarsiz) shu bo'laklardan birini O'Z ICHIGA olsa, qiymat yashiriladi. */
const SENSITIVE_FRAGMENTS = [
  "password", "passwd", "passhash", "token", "secret", "apikey", "authorization", "cookie", "credential", "privatekey",
  "initdata", "signature", "jwt", "otp",
  // to'lovning maxfiy ma'lumotlari
  "cardnumber", "cardno", "cvv", "cvc", "iban", "accountnumber", "transactionid", "bankaccount",
];
/** Faqat TO'LIQ moslik (qisqa so'zlar boshqa kalitlarni bekorga yashirmasligi uchun). */
const SENSITIVE_EXACT = new Set(["hash", "pin", "pan", "pass", "pwd", "card", "auth", "sid", "session", "sessionid"]);

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SENSITIVE_EXACT.has(k)) return true;
  return SENSITIVE_FRAGMENTS.some((f) => k.includes(f));
}

const SENSITIVE_QUERY_KEYS = /(password|passwd|pass|pwd|token|secret|api[_-]?key|authorization|initdata|init_data|hash|signature|code|otp|card|cvv|cvc|iban|transaction[_-]?id|jwt|session|sid)/i;

const PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, `Basic ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED], // JWT
  [/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, REDACTED], // Telegram bot token
  [/\b(?:query_id|user|auth_date|start_param|chat_instance|chat_type|hash)=[^\s"']*(?:&[A-Za-z_]+=[^\s"']*)*?hash=[0-9a-f]{64}[^\s"']*/gi, REDACTED], // initData
  [/(?:^|[?&\s"'])hash=[0-9a-f]{64}\b/gi, ` hash=${REDACTED}`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${REDACTED}@`], // ulanish manzilidagi parol: sxema://foydalanuvchi:PAROL@host
  [/\b(password|passwd|pwd|token|secret|api[_-]?key|initdata|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, `$1$2${REDACTED}`],
  [/\b\d{4}(?:[ -]\d{4}){3,4}\b/g, REDACTED], // 4111 1111 1111 1111
  [/\b\d{13,19}\b/g, REDACTED], // karta raqamiga o'xshash uzun raqamlar
];

export function scrubString(input: string): string {
  let s = input.length > MAX_STRING * 4 ? input.slice(0, MAX_STRING * 4) : input;
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  // Tarkibida initData belgilari bo'lgan to'liq qator (url-encoded) ham yashiriladi.
  if (/auth_date(=|%3D)\d+/i.test(s) && /hash(=|%3D)[0-9a-f]{64}/i.test(s)) return REDACTED;
  return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…[+${s.length - MAX_STRING}]` : s;
}

/** URL: yo'l va query. Maxfiy query qiymatlari yashiriladi, qolganlari qisqartiriladi. Hash (#) tashlanadi. */
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  const cut = url.split("#")[0] ?? "";
  const q = cut.indexOf("?");
  const path = scrubString(q === -1 ? cut : cut.slice(0, q)).slice(0, 200);
  if (q === -1) return path;
  const parts: string[] = [];
  for (const pair of cut.slice(q + 1).split("&").slice(0, 20)) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    let key = rawKey;
    try { key = decodeURIComponent(rawKey); } catch { /* xom kalit qoladi */ }
    key = key.slice(0, 40);
    if (eq === -1) { parts.push(key); continue; }
    const value = pair.slice(eq + 1);
    parts.push(isSensitiveKey(key) || SENSITIVE_QUERY_KEYS.test(key) ? `${key}=${REDACTED}` : `${key}=${scrubString(value.slice(0, 64))}`);
  }
  return `${path}?${parts.join("&")}`;
}

/** Ixtiyoriy qiymatni chuqur tozalaydi (chuqurlik/hajm cheklangan, aylanma havolalardan himoyalangan). */
export function scrub(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case "string": return scrubString(value);
    case "number": case "boolean": return value;
    case "bigint": return value.toString();
    case "function": case "symbol": return "[unserializable]";
  }
  const obj = value as object;
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "[invalid date]" : value.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `[Buffer ${value.length}b]`;
  if (depth >= MAX_DEPTH) return "[depth limit]";
  if (seen.has(obj)) return "[circular]";
  seen.add(obj);
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ITEMS).map((v) => scrub(v, depth + 1, seen));
    return value.length > MAX_ITEMS ? [...out, `[+${value.length - MAX_ITEMS} items]`] : out;
  }
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const key of Object.keys(obj)) {
    if (++n > MAX_KEYS) { out["…"] = "[more keys]"; break; }
    out[key] = isSensitiveKey(key) ? REDACTED : scrub((obj as Record<string, unknown>)[key], depth + 1, seen);
  }
  return out;
}

/** Xato: faqat tur, kod, tozalangan xabar va stack. Baza xatolari (Prisma) xabarida so'rov qiymatlari bo'lishi mumkin, shuning uchun xabar tozalanadi va qisqartiriladi. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { type: "NonError", message: scrubString(String(err)) };
  const code = (err as { code?: unknown }).code;
  return {
    type: err.name,
    ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    message: scrubString(err.message),
    ...(err.stack ? { stack: scrubString(err.stack.split("\n").slice(0, 12).join("\n")) } : {}),
  };
}
