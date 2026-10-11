#!/usr/bin/env node
/**
 * Deploy vaqtida env.js ni muhit o'zgaruvchilaridan yozadi (statik hosting uchun: frontendda runtime muhit o'zgaruvchisi yo'q).
 *
 *   SUTBOZOR_API_URL=https://api.example.com node scripts/generate-env.js [chiqish_fayli]
 *
 * Muhit o'zgaruvchilari:
 *   SUTBOZOR_API_URL       backend manzili (faqat domen va port, yo'lsiz). Production'da majburiy va faqat https
 *   SUTBOZOR_ENV           "production" (standart) yoki "development"
 *   SUTBOZOR_USE_BACKEND   "true" bo'lsa frontend backend xizmatlaridan foydalanishi mumkin (standart: false)
 * env.js ochiq fayl: unga maxfiy ma'lumot (token, parol, kalit) YOZILMAYDI.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const env = process.env.SUTBOZOR_ENV || "production";
const raw = (process.env.SUTBOZOR_API_URL || "").trim();
const out = path.resolve(process.argv[2] || path.join(process.cwd(), "env.js"));

function fail(msg) {
  console.error("generate-env: " + msg);
  process.exit(1);
}
if (env !== "production" && env !== "development") fail('SUTBOZOR_ENV "production" yoki "development" bo\'lishi kerak.');

const cfg = { env };
if (raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    fail("SUTBOZOR_API_URL noto'g'ri (masalan: https://api.example.com).");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") fail("SUTBOZOR_API_URL http yoki https bo'lishi kerak.");
  if (u.username || u.password) fail("SUTBOZOR_API_URL ichida login yoki parol bo'lmasligi kerak.");
  if ((u.pathname && u.pathname !== "/") || u.search || u.hash) fail("SUTBOZOR_API_URL faqat domen (va port) bo'lishi kerak, yo'lsiz.");
  if (env === "production" && u.protocol !== "https:") fail("Productionda SUTBOZOR_API_URL https bo'lishi kerak.");
  cfg.apiBaseUrl = u.origin;
} else if (env === "production") {
  fail("Production uchun SUTBOZOR_API_URL majburiy.");
}
cfg.useBackend = process.env.SUTBOZOR_USE_BACKEND === "true";

const body =
  "/* AVTOMATIK HOSIL QILINGAN (scripts/generate-env.js). Qo'lda tahrirlamang. Maxfiy ma'lumot saqlanmaydi. */\n" +
  "window.__SUTBOZOR_ENV__ = " + JSON.stringify(cfg) + ";\n";
fs.writeFileSync(out, body);
console.log("env.js yozildi: " + path.relative(process.cwd(), out) + " (" + cfg.env + ", " + (cfg.apiBaseUrl || "API manzili yo'q") + ", useBackend=" + cfg.useBackend + ")");
