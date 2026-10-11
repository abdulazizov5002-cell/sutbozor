import { AppError, ERROR_CODES } from "../../utils/errors";
import { telegramUserSchema } from "./schemas";
import type { UntrustedTelegramInitData, VerifiedTelegramIdentity } from "./types";

const MAX_LENGTH = 4096;
const MAX_FIELDS = 20;
const MAX_VALUE = 2048;

const invalid = (): AppError =>
  // Xabar initData qiymatini HECH QACHON aks ettirmaydi.
  new AppError(400, ERROR_CODES.INVALID_INIT_DATA, "Telegram ma'lumotlari noto'g'ri formatda.");

/**
 * initData qatorini tuzilma bo'yicha tahlil qiladi (KRIPTOGRAFIK TEKSHIRUV EMAS).
 * Qat'iy qoidalar: uzunlik chegarasi, takroriy kalit taqiqlangan (noaniqlik hujumi), maydonlar soni va uzunligi cheklangan,
 * `hash` (64 hex) va `auth_date` (butun son) majburiy, `user` JSON sxemaga mos bo'lishi shart.
 * Natija `trusted: false`: undan shaxs, rol yoki huquq aniqlanmaydi, buning uchun TelegramVerifier kerak.
 */
export function parseInitData(raw: unknown): UntrustedTelegramInitData {
  if (typeof raw !== "string" || raw.length < 10 || raw.length > MAX_LENGTH) throw invalid();

  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  let count = 0;
  for (const [key, value] of new URLSearchParams(raw)) {
    if (key in fields || key.length === 0 || key.length > 64 || value.length > MAX_VALUE || ++count > MAX_FIELDS) throw invalid();
    fields[key] = value;
  }

  const hash = fields.hash;
  const authDateRaw = fields.auth_date;
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw invalid();
  if (!authDateRaw || !/^\d{1,12}$/.test(authDateRaw)) throw invalid();

  let user: UntrustedTelegramInitData["user"];
  if (fields.user !== undefined) {
    let json: unknown;
    try {
      json = JSON.parse(fields.user);
    } catch {
      throw invalid();
    }
    const parsed = telegramUserSchema.safeParse(json);
    if (!parsed.success) throw invalid();
    user = parsed.data;
  }

  const dataCheckString = Object.keys(fields)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  return {
    trusted: false,
    fields,
    hash,
    authDate: Number(authDateRaw),
    ...(fields.query_id !== undefined ? { queryId: fields.query_id } : {}),
    ...(fields.start_param !== undefined ? { startParam: fields.start_param } : {}),
    ...(user ? { user } : {}),
    dataCheckString,
  };
}

/** auth_date yangiligi: kelajakda emas (1 daqiqa chetlanish) va maxAgeSec dan eski emas. Qaror verifier'da qabul qilinadi. */
export function isFresh(authDate: number, nowSec: number, maxAgeSec: number): boolean {
  return authDate <= nowSec + 60 && nowSec - authDate <= maxAgeSec;
}

/**
 * Tasdiqlangan initData'dan identifikator hosil qiladi. FAQAT kriptografik tekshiruv (HMAC) va yangilik tekshiruvi
 * muvaffaqiyatli o'tgandan KEYIN chaqiriladi (TelegramVerifier ichida). `user` bo'lmasa null.
 */
export function identityFromVerified(data: UntrustedTelegramInitData): VerifiedTelegramIdentity | null {
  const u = data.user;
  if (!u) return null;
  return {
    telegramId: String(u.id),
    username: u.username ?? null,
    firstName: u.first_name,
    lastName: u.last_name ?? null,
    photoUrl: u.photo_url ?? null,
    languageCode: u.language_code ?? null,
    authDate: data.authDate,
  };
}
