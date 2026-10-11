#!/usr/bin/env node
/**
 * Maxfiy ma'lumot (parol, token, kalit, ulanish manzili) kodga tushib qolmasligini tekshiradi. Bog'liqliksiz (faqat Node).
 *
 *   node scripts/check-secrets.js                   butun repozitoriyni tekshiradi
 *   node scripts/check-secrets.js --staged          faqat git'ga qo'shilgan (staged) fayllar (pre-commit)
 *   node scripts/check-secrets.js --update-baseline mavjud topilmalarni "ma'lum qarz" sifatida yozadi
 *
 * Baseline (security/secret-baseline.json): hozirgi frontenddagi demo admin kirishi kabi MA'LUM qarzlar ro'yxati.
 * Ular xato hisoblanmaydi, lekin har safar eslatiladi. YANGI topilma bo'lsa chiqish kodi 1 (commit/CI to'xtaydi).
 * Qarz bartaraf etilgach baseline'dan o'chiriladi (docs/SECURITY.md, "Frontenddan olib tashlash rejasi").
 * Topilgan qiymat to'liq chop etilmaydi (faqat boshi), shunda log'lar ham sir tarqatmaydi.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ROOT = path.resolve(opt("--root", path.join(__dirname, "..", "..")));
const BASELINE = path.resolve(opt("--baseline", path.join(__dirname, "..", "security", "secret-baseline.json")));

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "artifacts"]);
const SKIP_EXT = new Set([".zip", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".lock"]);
const SKIP_FILES = new Set(["package-lock.json", "secret-baseline.json"]);
const PLACEHOLDER = /CHANGE_?ME|YOUR_|<[^>]+>|\*{3,}|x{4,}|example|placeholder|dummy/i;
const CODE = /\.(html?|js|mjs|cjs|ts|tsx|jsx|json)$/i;

const RULES = [
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { id: "telegram-bot-token", re: /\b\d{8,10}:[A-Za-z0-9_-]{30,50}(?![A-Za-z0-9_-])/g },
  { id: "db-url-with-password", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/'"]+:([^\s@/'"]+)@/g, ok: (m) => PLACEHOLDER.test(m[1]) },
  { id: "secret-assignment", re: /\b(?:JWT_SECRET|SECRET_KEY|API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|BOT_TOKEN|CLIENT_SECRET|PRIVATE_KEY)\b["']?\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi, ok: (m) => PLACEHOLDER.test(m[1]) },
  { id: "hardcoded-password", re: /\b(?:password|passwd|pwd)\b["']?\s*[:=]\s*["']([^"'\s]{4,})["']/gi, ok: (m) => PLACEHOLDER.test(m[1]), codeOnly: true },
  { id: "frontend-admin-credentials", re: /\bADMIN_DEMO\s*=\s*\{[^}]*\}|\badmin123\b/g, codeOnly: true },
  { id: "password-hash-in-source", re: /\b(?:passHash|password_?hash|passwordHash)\b\s*[:=]\s*["'][0-9a-f]{32,}["']/gi, codeOnly: true },
];

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else out.push(path.join(dir, e.name));
  }
  return out;
}

function stagedFiles() {
  try {
    const top = cp.execSync("git rev-parse --show-toplevel", { cwd: ROOT }).toString().trim();
    const names = cp.execSync("git diff --cached --name-only --diff-filter=ACM", { cwd: top }).toString().split("\n").filter(Boolean);
    return names.map((n) => path.join(top, n)).filter((f) => f.startsWith(ROOT));
  } catch {
    console.error("git topilmadi: butun repozitoriya tekshiriladi.");
    return walk(ROOT);
  }
}

function scan(files) {
  const findings = [];
  const envFiles = [];
  for (const f of files) {
    const base = path.basename(f);
    if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") envFiles.push(rel(f));
    if (SKIP_FILES.has(base) || SKIP_EXT.has(path.extname(f).toLowerCase())) continue;
    let text;
    try {
      if (fs.statSync(f).size > 2_000_000) continue;
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const rule of RULES) {
      if (rule.codeOnly && !CODE.test(f)) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text))) {
        if (rule.ok && rule.ok(m)) continue;
        const line = text.slice(0, m.index).split("\n").length;
        const fp = crypto.createHash("sha256").update(`${rel(f)}|${rule.id}|${m[0]}`).digest("hex").slice(0, 12);
        findings.push({ file: rel(f), rule: rule.id, line, fp, preview: m[0].slice(0, 8) + "…" });
      }
    }
  }
  return { findings, envFiles };
}

const staged = flag("--staged");
const files = staged ? stagedFiles() : walk(ROOT);
const { findings, envFiles } = scan(files);

let baseline = { version: 1, findings: [] };
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
} catch {
  /* baseline yo'q: hamma topilma yangi hisoblanadi */
}

if (flag("--update-baseline")) {
  const notes = new Map((baseline.findings || []).map((b) => [b.fp, b.note]));
  const next = {
    version: 1,
    findings: findings.map((f) => ({ file: f.file, rule: f.rule, fp: f.fp, note: notes.get(f.fp) || "Ma'lum qarz: backend auth bosqichida olib tashlanadi." })),
  };
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  console.log(`Baseline yozildi: ${next.findings.length} ta ma'lum qarz.`);
  process.exit(0);
}

const known = new Set((baseline.findings || []).map((b) => b.fp));
const fresh = findings.filter((f) => !known.has(f.fp));
const debt = findings.filter((f) => known.has(f.fp));
const scannedFiles = new Set(files.map(rel));
const resolved = staged ? [] : (baseline.findings || []).filter((b) => scannedFiles.has(b.file) && !findings.some((f) => f.fp === b.fp));

for (const e of envFiles) console.log(`ESLATMA  ${e}: mahalliy .env fayli git'ga qo'shilmasligi kerak (.gitignore).`);
for (const f of debt) console.log(`QARZ     ${f.file}:${f.line}  ${f.rule}  (${f.preview}) baseline'da, olib tashlanishi kerak`);
for (const b of resolved) console.log(`BARTARAF ${b.file}  ${b.rule}: endi topilmadi, baseline'dan o'chiring (--update-baseline)`);
for (const f of fresh) console.log(`YANGI    ${f.file}:${f.line}  ${f.rule}  (${f.preview})`);

console.log(`\n${files.length} fayl tekshirildi: ${fresh.length} yangi topilma, ${debt.length} ma'lum qarz.`);
if (fresh.length > 0) {
  console.error("MAXFIY MA'LUMOT topildi. Uni kodga yozmang: muhit o'zgaruvchisi yoki hosting sirlar bo'limidan foydalaning.");
  process.exit(1);
}
