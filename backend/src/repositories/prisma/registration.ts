import type { PrismaClient } from "@prisma/client";
import type { NewRegistration, RegistrationStore } from "../../auth/ports";
import { conflict } from "../../utils/errors";
import { mapUser } from "./mappers";

/** PostgreSQL unique buzilishi (Prisma P2002). Prisma klassini import qilmaymiz: faqat xato kodini tekshiramiz. */
const uniqueTarget = (e: unknown): string | null => {
  if (typeof e !== "object" || e === null || (e as { code?: unknown }).code !== "P2002") return null;
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.join(",") : typeof target === "string" ? target : "";
};

/**
 * Tashkilot + User + Telegram bog'lash + audit yozuvi: hammasi bitta tranzaksiyada (biri xato bo'lsa hech biri saqlanmaydi).
 * Bog'lash `updateMany({ where: { userId: null } })` bilan: ikki parallel so'rovdan faqat bittasi hisobni bog'lay oladi.
 */
export function createPrismaRegistrationStore(prisma: PrismaClient): RegistrationStore {
  return {
    async register(input: NewRegistration) {
      try {
        return await prisma.$transaction(async (tx) => {
          const orgIds =
            input.role === "business"
              ? { businessId: (await tx.business.create({ data: input.organization, select: { id: true } })).id }
              : { supplierId: (await tx.supplier.create({ data: input.organization, select: { id: true } })).id };

          const user = await tx.user.create({
            data: {
              name: input.name, phone: input.phone, email: input.email, role: input.role, status: input.status, ...orgIds,
              termsAcceptedAt: new Date(), termsVersion: input.termsVersion,
            },
          });

          const linked = await tx.telegramAccount.updateMany({
            where: { id: input.telegramAccountId, userId: null },
            data: { userId: user.id },
          });
          if (linked.count !== 1) throw conflict("Bu Telegram hisobi allaqachon ro'yxatdan o'tgan.");

          await tx.auditLog.create({
            data: {
              actorId: user.id,
              actorName: user.name,
              actorRole: user.role,
              action: "auth.register",
              objectType: "user",
              objectId: user.id,
              description: `Ro'yxatdan o'tdi (${input.role}), holat: ${input.status}, shartlar v${input.termsVersion}`,
            },
          });
          return mapUser(user);
        });
      } catch (e) {
        const target = uniqueTarget(e);
        if (target === null) throw e;
        if (target.includes("email")) throw conflict("Bu email manzili allaqachon ishlatilgan.");
        if (target.includes("phone")) throw conflict("Bu telefon raqami allaqachon ro'yxatdan o'tgan.");
        throw conflict("Bu ma'lumotlar bilan hisob allaqachon mavjud.");
      }
    },
  };
}
