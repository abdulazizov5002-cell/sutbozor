import { API_MODULES, type ApiModule } from "../config/constants";
import { notImplemented } from "../utils/errors";
import { ok } from "../utils/response";

export const foundationController = {
  /** GET /api: modullar ro'yxati va holati. */
  index: async () =>
    ok({
      service: "sutbozor-backend",
      modules: API_MODULES.map((name) => ({ name, path: `/api/${name}`, status: "planned" as const })),
    }),

  /** Hali amalga oshirilmagan modul: soxta ma'lumot o'rniga halol 501 qaytariladi. */
  notImplemented: (module: ApiModule) => async () => {
    throw notImplemented(`"${module}" moduli keyingi bosqichda ishga tushiriladi.`);
  },
};
