/**
 * Tarmoq va Fastify KERAK EMAS: HTTP qatlamining sof qismlarini tekshiradi (xato xaritasi, notFound, CORS/Helmet sozlamasi, validatsiya, health).
 * Fastify'ning haqiqiy xato shakllari (statusCode/code) qo'lda berilgan. To'liq HTTP tekshiruvi: tests/http.test.ts.
 */
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { errorHandler, notFoundHandler, toErrorResponse } from "../src/middleware/errorHandler";
import { buildCorsOptions, buildHelmetOptions, NO_STORE_HEADERS } from "../src/security/config";
import { getHealth } from "../src/services/health.service";
import { validateRequest } from "../src/validation/validate";
import { telegramLoginBody } from "../src/schemas/auth.schemas";
import { AppError, ERROR_CODES } from "../src/utils/errors";
import "../src/validation/errorMap";

let pass = 0, fail = 0;
const t = (n: string, f: () => void) => { try { f(); pass++; } catch (e) { fail++; console.log("FAIL", n, (e as Error).message); } };
const fastifyErr = (statusCode: number, code: string, message: string) => Object.assign(new Error(message), { statusCode, code });
const run = (error: unknown) => {
  const logs: unknown[] = []; let sent: any = {}; let status = 0;
  const reply: any = { status(s: number) { status = s; return this; }, send(b: unknown) { sent = b; return this; } };
  errorHandler(error, { log: { error: (...a: unknown[]) => logs.push(a) } } as any, reply);
  return { status, body: sent, logs };
};

t("health", () => assert.deepEqual(getHealth(), { status: "ok", service: "sutbozor-backend" }));

t("invalid route -> 404 NOT_FOUND, standart format", () => {
  let status = 0, body: any; const reply: any = { status(s: number) { status = s; return this; }, send(b: unknown) { body = b; return this; } };
  notFoundHandler({} as any, reply);
  assert.equal(status, 404); assert.equal(body.success, false); assert.equal(body.error.code, "NOT_FOUND");
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
});

t("malformed JSON (Fastify 400) -> BAD_REQUEST, parser matni sizmaydi", () => {
  for (const c of ["FST_ERR_CTP_INVALID_JSON_BODY", "FST_ERR_CTP_EMPTY_JSON_BODY"]) {
    const r = run(fastifyErr(400, c, "Unexpected token } in JSON at position 17"));
    assert.equal(r.status, 400); assert.equal(r.body.error.code, ERROR_CODES.BAD_REQUEST);
    assert.ok(!JSON.stringify(r.body).includes("Unexpected") && !JSON.stringify(r.body).includes("position"));
  }
});
t("413 / 415 / 429 xaritasi", () => {
  assert.equal(run(fastifyErr(413, "FST_ERR_CTP_BODY_TOO_LARGE", "Request body is too large")).body.error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(run(fastifyErr(415, "FST_ERR_CTP_INVALID_MEDIA_TYPE", "Unsupported Media Type: text/plain")).body.error.code, "UNSUPPORTED_MEDIA_TYPE");
  const rl = run({ statusCode: 429, error: "Too Many Requests", message: "Rate limit exceeded, retry in 1 minute" });
  assert.equal(rl.status, 429); assert.equal(rl.body.error.code, "RATE_LIMITED");
});
t("validation error -> 400 VALIDATION_ERROR + details", () => {
  let err: unknown; try { validateRequest({ body: { role: "admin" } }, { body: telegramLoginBody }); } catch (e) { err = e; }
  assert.ok(err instanceof ZodError);
  const r = run(err);
  assert.equal(r.status, 400); assert.equal(r.body.error.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(r.body.error.details) && r.body.error.details.length >= 1);
  assert.ok(r.body.error.details.every((d: any) => typeof d.path === "string" && typeof d.message === "string"));
  assert.ok(!JSON.stringify(r.body).includes('"admin"'), "qiymat aks etmasligi kerak");
});
t("body yo'q -> 400", () => assert.throws(() => validateRequest({}, { body: telegramLoginBody }), ZodError));
t("validation: ortiqcha maydon (role) rad etiladi, to'g'ri body o'tadi", () => {
  assert.throws(() => validateRequest({ body: { initData: "x".repeat(20), role: "admin" } }, { body: telegramLoginBody }), ZodError);
  assert.deepEqual(validateRequest({ body: { initData: "x".repeat(20) } }, { body: telegramLoginBody }).body, { initData: "x".repeat(20) });
});
t("error handler: kutilmagan xato -> 500, hech narsa sizmaydi, serverga log", () => {
  const r = run(new Error("connect ECONNREFUSED 10.0.0.5 password=hunter2 at /srv/app/db.ts:12"));
  assert.equal(r.status, 500); assert.equal(r.body.error.code, "INTERNAL_ERROR");
  const s = JSON.stringify(r.body);
  for (const bad of ["hunter2", "10.0.0.5", "/srv", "ECONNREFUSED", "stack"]) assert.ok(!s.includes(bad), bad);
  assert.equal(r.logs.length, 1);
});
t("error handler: AppError xabari saqlanadi, 5xx AppError log qilinmaydi", () => {
  const r = run(new AppError(409, ERROR_CODES.CONFLICT, "Allaqachon mavjud."));
  assert.equal(r.status, 409); assert.equal(r.body.error.message, "Allaqachon mavjud."); assert.equal(r.logs.length, 0);
});
t("error handler: 502/503/504 -> SERVICE_UNAVAILABLE, matn umumiy", () => {
  for (const s of [502, 503, 504]) { const r = run({ statusCode: s, message: "upstream secret-host" }); assert.equal(r.status, s); assert.equal(r.body.error.code, "SERVICE_UNAVAILABLE"); assert.ok(!JSON.stringify(r.body).includes("secret-host")); }
});
t("error handler: null/primitiv xato ham 500 beradi (yiqilmaydi)", () => {
  for (const e of [null, undefined, "boom", 42, {}]) assert.equal(run(e).status, 500);
});
t("toErrorResponse: noma'lum 4xx umumiy xabar bilan", () => {
  const r = toErrorResponse(fastifyErr(404, "X", "internal detail")); assert.ok(!JSON.stringify(r.body).includes("internal detail"));
});

t("CORS: aniq ro'yxat, '*' yo'q, credentials o'chiq, preflight sozlamalari", () => {
  const o = buildCorsOptions(["http://localhost:5173", "https://app.example.com"]);
  assert.deepEqual(o.origin, ["http://localhost:5173", "https://app.example.com"]);
  assert.equal(o.credentials, false); assert.equal(o.optionsSuccessStatus, 204); assert.equal(o.maxAge, 600);
  assert.ok(o.methods.includes("POST") && o.methods.includes("OPTIONS"));
  assert.ok(o.allowedHeaders.includes("Authorization") && o.allowedHeaders.includes("Content-Type"));
  assert.ok(o.exposedHeaders.includes("x-request-id"));
  assert.ok(!JSON.stringify(o).includes('"*"'));
});
t("Helmet: CSP default-src 'none', HSTS faqat productionda, no-store", () => {
  const dev = buildHelmetOptions(false) as any, prod = buildHelmetOptions(true) as any;
  assert.deepEqual(dev.contentSecurityPolicy.directives.defaultSrc, ["'none'"]);
  assert.equal(dev.hsts, false); assert.ok(prod.hsts.maxAge >= 15_552_000);
  assert.equal(NO_STORE_HEADERS["Cache-Control"], "no-store");
});

console.log(`contract: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
