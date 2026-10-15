export interface HealthStatus {
  status: "ok";
  service: "sutbozor-backend";
}

export function getHealth(): HealthStatus {
  return { status: "ok", service: "sutbozor-backend" };
}

export interface ReadinessResult {
  statusCode: 200 | 503;
  body: { status: "ok" | "unavailable"; service: "sutbozor-backend"; database: "ok" | "down" | "not_configured" };
}

/**
 * GET /api/ready: server VA baza ishlayaptimi. `ping` bazaga yengil so'rov yuboradi (SELECT 1).
 * Berilmasa (baza ulanmagan) 503 `not_configured`. Baza javob bermasa yoki `timeoutMs` dan sekin bo'lsa 503 `down`.
 * Xato matni/ulanish ma'lumoti javobga CHIQMAYDI (faqat holat so'zlari).
 */
export async function checkReadiness(ping: (() => Promise<void>) | undefined, timeoutMs = 3000): Promise<ReadinessResult> {
  const base = { service: "sutbozor-backend" as const };
  if (!ping) return { statusCode: 503, body: { status: "unavailable", ...base, database: "not_configured" } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
    ]);
    return { statusCode: 200, body: { status: "ok", ...base, database: "ok" } };
  } catch {
    return { statusCode: 503, body: { status: "unavailable", ...base, database: "down" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
