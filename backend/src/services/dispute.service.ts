import type { Contract, Dispute, NewAuditLog, Payment } from "../domain/entities";
import type { DisputeStatus } from "../config/constants";
import { canAccessDispute, canAccessOrder, ownerScope } from "../policies/ownership";
import type { ContractRepository, DisputeRepository, NewNotification, OrderRepository, PaymentRepository, Recipient } from "../repositories/ports";
import type { OpenDisputeBody } from "../schemas/dispute.schemas";
import type { AuthUser } from "../types/fastify";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export type DisputeUpdate = { status: "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "CLOSED"; resolution: string };

export interface DisputeService extends ReadService<Dispute> {
  open(actor: AuthUser, input: OpenDisputeBody): Promise<Dispute>;
  update(actor: AuthUser, id: string, input: DisputeUpdate): Promise<Dispute>;
}

/** Admin qaysi holatdan qaysi holatga o'tkaza oladi (boshqasi -> 409). */
const FROM: Record<DisputeUpdate["status"], DisputeStatus[]> = {
  UNDER_REVIEW: ["OPEN"],
  RESOLVED: ["OPEN", "UNDER_REVIEW"],
  REJECTED: ["OPEN", "UNDER_REVIEW"],
  CLOSED: ["RESOLVED", "REJECTED"],
};
const STATUS_UZ: Record<DisputeStatus, string> = {
  OPEN: "Ochiq", UNDER_REVIEW: "Ko'rib chiqilmoqda", RESOLVED: "Hal qilindi", REJECTED: "Rad etildi", CLOSED: "Yopildi",
};

interface Deps {
  disputes: DisputeRepository;
  orders: OrderRepository;
  payments: PaymentRepository;
  contracts: ContractRepository;
}

/**
 * Nizolar (F bosqichi). Nizoni biznes yoki supplier ochadi (o'z buyurtmasi/to'lovi/shartnomasi bo'yicha); hal qilish faqat admin.
 * SutBozor pul ushlab turmaydi: nizo qaror va yozuv uchun, pul harakati qilmaydi va to'lov holatini o'zgartirmaydi.
 * Tartib: validatsiya (400) -> huquq (403) -> egalik (404) -> holat (409).
 */
export function createDisputeService(d: Deps): DisputeService {
  const reader = createScopedReadService<Dispute>({
    repo: d.disputes, anyOf: ["disputes.manage", "disputes.create"], scope: ownerScope, canAccess: canAccessDispute,
  });
  const audit = (actor: AuthUser, action: string, x: Dispute, description: string): NewAuditLog => ({
    actorId: actor.id, actorName: actor.name ?? actor.id, actorRole: actor.role, action, objectType: "dispute", objectId: x.id, description,
  });

  return {
    getById: reader.getById,
    list: reader.list,

    async open(actor, input) {
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (actor.role !== "business" && actor.role !== "supplier") throw forbidden();
      if (!hasPermission(actor.role, "disputes.create")) throw forbidden();
      const mine = actor.role === "business" ? actor.businessId : actor.supplierId;
      if (!mine) throw forbidden("Hisob biriktirilmagan.");

      const order = await d.orders.findById(input.orderId);
      if (!order || !canAccessOrder(actor, order)) throw notFound();

      const isMine = (x: { businessId: string; supplierId: string }) => (actor.role === "business" ? x.businessId : x.supplierId) === mine;
      let payment: Payment | null = null;
      if (input.paymentId) {
        payment = await d.payments.findById(input.paymentId);
        if (!payment || payment.orderId !== order.id || !isMine(payment)) throw notFound();
      }
      let contract: Contract | null = null;
      if (input.contractId) {
        contract = await d.contracts.findById(input.contractId);
        if (!contract || contract.orderId !== order.id || !isMine(contract)) throw notFound();
      }

      // Qarshi tomon (supplier): to'lov/shartnomadan, bo'lmasa supplier o'zi, bo'lmasa biznes ko'rsatadi (yoki bitta supplier bo'lsa o'zi aniq).
      const orderSuppliers = [...new Set(order.items.map((i) => i.supplierId))];
      let supplierId: string;
      if (actor.role === "supplier") supplierId = actor.supplierId!;
      else {
        const guess = payment?.supplierId ?? contract?.supplierId ?? input.supplierId ?? (orderSuppliers.length === 1 ? orderSuppliers[0] : undefined);
        if (!guess) throw badRequest("Qaysi supplier bilan nizo ekanini ko'rsating (supplierId yoki to'lov/shartnoma).");
        supplierId = guess;
      }
      if (!orderSuppliers.includes(supplierId)) throw notFound();
      if (input.supplierId && input.supplierId !== supplierId) throw badRequest("Ko'rsatilgan supplier to'lov/shartnomaga mos kelmaydi.");
      if (payment && payment.supplierId !== supplierId) throw badRequest("To'lov bu supplierga tegishli emas.");
      if (contract && contract.supplierId !== supplierId) throw badRequest("Shartnoma bu supplierga tegishli emas.");

      const businessId = order.businessId;
      const counterparty: Recipient = actor.role === "business" ? { supplierId } : { businessId };
      const who = actor.name ?? (actor.role === "business" ? "Biznes" : "Supplier");
      return d.disputes.create(
        {
          orderId: order.id, paymentId: payment?.id ?? null, contractId: contract?.id ?? null, openedBy: actor.role, openedById: actor.id,
          businessId, supplierId, reason: input.reason, description: input.description,
        },
        {
          audit: (x) => audit(actor, "dispute.opened", x, `Nizo ${x.publicId} ochildi (${order.publicId}, sabab: ${x.reason})`),
          recipients: [counterparty, { admins: true }],
          notify: (x): NewNotification => ({
            type: "dispute.open", title: "Yangi nizo",
            message: `${who}: ${order.publicId} bo'yicha nizo ochdi (${x.publicId}). Sabab: ${x.description}`,
          }),
        },
      );
    },

    async update(actor, id, input) {
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (actor.role !== "admin" || !hasPermission(actor.role, "disputes.manage")) throw forbidden();
      const dispute = await d.disputes.findById(id);
      if (!dispute) throw notFound();
      const stale = "Bu nizoning hozirgi holatida bu o'zgartirishni qilib bo'lmaydi. Sahifani yangilang.";
      if (!FROM[input.status].includes(dispute.status)) throw conflict(stale);
      const decided = input.status === "RESOLVED" || input.status === "REJECTED";
      const updated = await d.disputes.transition(
        { id, from: FROM[input.status], to: input.status, ...(decided ? { resolution: input.resolution, resolvedBy: actor.id } : {}) },
        {
          audit: (x) => audit(actor, "dispute.status", x, `Nizo ${x.publicId}: ${STATUS_UZ[dispute.status]} -> ${STATUS_UZ[x.status]}`),
          recipients: [{ businessId: dispute.businessId }, { supplierId: dispute.supplierId }],
          notify: (x): NewNotification => ({
            type: decided ? "dispute.resolved" : "dispute.open",
            title: `Nizo ${x.publicId}: ${STATUS_UZ[x.status]}`,
            message: decided && input.resolution ? `Qaror: ${input.resolution}` : `Nizo holati: ${STATUS_UZ[x.status]}.`,
          }),
        },
      );
      if (!updated) throw conflict(stale);
      return updated;
    },
  };
}
