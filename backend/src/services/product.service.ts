import { PRODUCT_UNITS, type ProductName } from "../config/constants";
import type { NewAuditLog, Product } from "../domain/entities";
import { canAccessProduct, productScope } from "../policies/ownership";
import type { ProductRepository } from "../repositories/ports";
import type { CreateProductBody, UpdateProductBody } from "../schemas/product.schemas";
import type { AuthUser } from "../types/fastify";
import { forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface ProductService extends ReadService<Product> {
  create(actor: AuthUser, input: CreateProductBody): Promise<Product>;
  update(actor: AuthUser, id: string, patch: UpdateProductBody): Promise<Product>;
  remove(actor: AuthUser, id: string): Promise<void>;
}

const FIELD_LABEL = { availableToday: "bugungi miqdor", dailyCapacity: "kunlik hajm", pricePerUnit: "narx" } as const;

/**
 * Mahsulotlar: o'qish (biznes bozorni, supplier o'zinikini) va yozish (faqat supplier, faqat o'z mahsulotlari).
 * Yozishda: `products.manage` huquqi + supplierga biriktirilgan hisob; supplierId HAR DOIM tokendagi foydalanuvchidan olinadi.
 * Begona mahsulot uchun 404 (403 emas): mavjudligi sizib chiqmasin. Har yozish audit yozuvi bilan bitta tranzaksiyada.
 */
export function createProductService(repo: ProductRepository): ProductService {
  const reader = createScopedReadService<Product>({
    repo,
    anyOf: ["market.view", "products.manage", "suppliers.view"],
    scope: productScope,
    canAccess: canAccessProduct,
  });

  /** Yozish huquqi: faol supplier. Qaytaradi: supplierId. */
  const writerSupplierId = (actor: AuthUser): string => {
    if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
    if (!hasPermission(actor.role, "products.manage")) throw forbidden();
    if (!actor.supplierId) throw forbidden("Hisob supplierga biriktirilmagan.");
    return actor.supplierId;
  };
  /** O'z mahsuloti; yo'q yoki begona bo'lsa 404. */
  const ownProduct = async (supplierId: string, id: string): Promise<Product> => {
    const p = await repo.findById(id);
    if (!p || p.supplierId !== supplierId) throw notFound();
    return p;
  };
  const audit = (actor: AuthUser, action: string, p: Product, description: string): NewAuditLog => ({
    actorId: actor.id, actorName: actor.name ?? actor.id, actorRole: actor.role, action, objectType: "product", objectId: p.id, description,
  });

  return {
    ...reader,
    async create(actor, input) {
      const supplierId = writerSupplierId(actor);
      const name = input.name as ProductName;
      return repo.create(
        {
          supplierId, name, unit: PRODUCT_UNITS[name], availableToday: input.availableToday,
          dailyCapacity: input.dailyCapacity, pricePerUnit: input.pricePerUnit,
        },
        (p) => audit(actor, "product.create", p, `Mahsulot qo'shildi: ${p.name}`),
      );
    },
    async update(actor, id, patch) {
      const supplierId = writerSupplierId(actor);
      await ownProduct(supplierId, id);
      const changed = (Object.keys(patch) as (keyof typeof FIELD_LABEL)[]).filter((k) => patch[k] !== undefined);
      const updated = await repo.update(
        id,
        patch,
        (p) => audit(actor, "product.update", p, `Mahsulot yangilandi: ${p.name} (${changed.map((k) => FIELD_LABEL[k]).join(", ")})`),
      );
      if (!updated) throw notFound();
      return updated;
    },
    async remove(actor, id) {
      const supplierId = writerSupplierId(actor);
      await ownProduct(supplierId, id);
      const removed = await repo.remove(id, (p) => audit(actor, "product.delete", p, `Mahsulot o'chirildi: ${p.name}`));
      if (!removed) throw notFound();
    },
  };
}
