import { notImplemented } from "../utils/errors";
import type { Repositories } from "./ports";

/** Database ulanmaguncha har bir repository chaqiruvi halol 501 qaytaradi (soxta ma'lumot yo'q). */
const stub = <T extends object>(name: string): T =>
  new Proxy({} as T, {
    get: (_target, prop) =>
      typeof prop === "string"
        ? () => Promise.reject(notImplemented(`${name}.${prop}: ma'lumotlar bazasi hali ulanmagan.`))
        : undefined,
  });

export const notImplementedRepositories = (): Repositories => ({
  users: stub("users"),
  businesses: stub("businesses"),
  suppliers: stub("suppliers"),
  products: stub("products"),
  orders: stub("orders"),
  contracts: stub("contracts"),
  payments: stub("payments"),
  disputes: stub("disputes"),
  ratings: stub("ratings"),
  notifications: stub("notifications"),
  audit: stub("audit"),
});
