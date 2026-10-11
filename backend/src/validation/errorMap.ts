import { z, ZodIssueCode, type ZodErrorMap } from "zod";

/**
 * Zod xabarlarini tushunarli o'zbek tiliga o'tkazadi. Xabarlar maydon nomisiz yoziladi (maydon `path` da keladi).
 * XAVFSIZLIK: foydalanuvchi yuborgan qiymat xabarga HECH QACHON qo'shilmaydi (aks ettirilmaydi).
 */
const TYPES: Record<string, string> = {
  string: "matn", number: "son", integer: "butun son", float: "kasr son", boolean: "mantiqiy qiymat (true/false)",
  object: "obyekt", array: "ro'yxat", date: "sana", nan: "son", bigint: "butun son", undefined: "qiymat", null: "bo'sh qiymat",
};
const uz = (t: string): string => TYPES[t] ?? t;

export const uzErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return { message: "Majburiy maydon." };
      if (issue.received === "null") return { message: "Bo'sh qiymat bo'lishi mumkin emas." };
      return { message: `Noto'g'ri tur: ${uz(issue.expected)} kutilgan.` };

    case ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      if (issue.type === "string") {
        if (issue.exact) return { message: `Aynan ${min} ta belgi bo'lishi kerak.` };
        return { message: min <= 1 ? "Bo'sh bo'lmasligi kerak." : `Kamida ${min} ta belgi bo'lishi kerak.` };
      }
      if (issue.type === "array" || issue.type === "set") return { message: `Kamida ${min} ta element bo'lishi kerak.` };
      if (issue.type === "date") return { message: "Sana juda erta." };
      return { message: issue.inclusive ? `${min} dan kichik bo'lmasligi kerak.` : `${min} dan katta bo'lishi kerak.` };
    }

    case ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      if (issue.type === "string") return { message: `Ko'pi bilan ${max} ta belgi bo'lishi kerak.` };
      if (issue.type === "array" || issue.type === "set") return { message: `Ko'pi bilan ${max} ta element bo'lishi kerak.` };
      if (issue.type === "date") return { message: "Sana juda kech." };
      return { message: issue.inclusive ? `${max} dan katta bo'lmasligi kerak.` : `${max} dan kichik bo'lishi kerak.` };
    }

    case ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Email manzili noto'g'ri." };
      if (issue.validation === "uuid") return { message: "ID formati noto'g'ri (UUID kutilgan)." };
      if (issue.validation === "url") return { message: "URL manzili noto'g'ri." };
      if (issue.validation === "datetime") return { message: "Sana va vaqt formati noto'g'ri." };
      return { message: "Format noto'g'ri." };

    case ZodIssueCode.invalid_enum_value: {
      const shown = issue.options.slice(0, 8).map(String).join(", ");
      return { message: `Ruxsat etilgan qiymatlar: ${shown}${issue.options.length > 8 ? ", ..." : ""}.` };
    }

    case ZodIssueCode.invalid_literal:
      return { message: "Noto'g'ri qiymat." };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Noma'lum maydon: ${issue.keys.join(", ")}.` };
    case ZodIssueCode.not_multiple_of:
      return { message: issue.multipleOf === 0.01 ? "Eng ko'pi bilan 2 ta kasr xona bo'lishi mumkin." : `${issue.multipleOf} ga karrali bo'lishi kerak.` };
    case ZodIssueCode.not_finite:
      return { message: "Son cheksiz bo'lishi mumkin emas." };
    case ZodIssueCode.invalid_date:
      return { message: "Sana noto'g'ri." };
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
      return { message: "Qiymat ruxsat etilgan variantlardan biriga mos emas." };
    default:
      return { message: ctx.defaultError };
  }
};

/** Barcha sxemalar uchun global xabarlar. Modul yuklanganda o'rnatiladi (app.ts va primitives.ts import qiladi). */
z.setErrorMap(uzErrorMap);
