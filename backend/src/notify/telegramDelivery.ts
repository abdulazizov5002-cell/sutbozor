import type { DeliveryBatch, NotificationDelivery } from "../repositories/prisma/delivery";

export interface TelegramDeliveryOptions {
  botToken: string;
  /** Foydalanuvchi id'lari -> chat id'lari. */
  lookupChatIds: (userIds: string[]) => Promise<string[]>;
  fetchFn?: typeof fetch;
  /** Xato haqida ma'lumot (token HECH QACHON kiritilmaydi). */
  onError?: (info: { stage: string; status?: number }) => void;
  timeoutMs?: number;
}

const MAX_TEXT = 3900;
const CHUNK = 5;

/**
 * Telegram bot orqali bildirishnoma yuborish (sendMessage). Best-effort: xato asosiy amalni to'xtatmaydi, qayta urinish yo'q.
 * Bot foydalanuvchi ruxsatisiz yoza olmaydi (foydalanuvchi botni ochgan bo'lishi kerak): 403 oddiy holat, jim o'tkaziladi.
 * Matn oddiy matn (parse_mode yo'q): foydalanuvchi kiritgan matn orqali belgilash/havola kiritib bo'lmaydi.
 */
export function createTelegramDelivery(opts: TelegramDeliveryOptions): NotificationDelivery {
  const doFetch = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const url = `https://api.telegram.org/bot${opts.botToken}/sendMessage`;

  const send = async (chatId: string, text: string): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!res.ok && res.status !== 403) opts.onError?.({ stage: "send", status: res.status });
    } catch {
      opts.onError?.({ stage: "send" });
    } finally {
      clearTimeout(timer);
    }
  };

  const run = async (batches: DeliveryBatch[]): Promise<void> => {
    for (const b of batches) {
      let chatIds: string[];
      try { chatIds = [...new Set(await opts.lookupChatIds(b.userIds))]; } catch { opts.onError?.({ stage: "lookup" }); continue; }
      const text = `🔔 ${b.title}\n${b.message}`.slice(0, MAX_TEXT);
      for (let i = 0; i < chatIds.length; i += CHUNK) await Promise.all(chatIds.slice(i, i + CHUNK).map((c) => send(c, text)));
    }
  };

  return {
    deliver(batches) {
      void run(batches).catch(() => opts.onError?.({ stage: "run" }));
    },
  };
}
