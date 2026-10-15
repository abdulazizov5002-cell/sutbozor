import type { NewAuditLog, Product } from "../../src/domain/entities";
import type { ListParams, NewProduct, Page, ProductPatch, ProductRepository, Scope } from "../../src/repositories/ports";
import { conflict } from "../../src/utils/errors";

/** Xotiradagi soxta mahsulot ombori (faqat testlar uchun): audit callback'larini va scope'larni yozib boradi. */
export function fakeProductRepo(seed: Product[] = []) {
  const items = [...seed];
  const audits: NewAuditLog[] = [];
  const scopes: Scope[] = [];
  let seq = 0;
  const repo: ProductRepository = {
    async findById(id) { return items.find((p) => p.id === id) ?? null; },
    async list(scope: Scope, { page, limit }: ListParams): Promise<Page<Product>> {
      scopes.push(scope);
      const rows = items.filter((p) => !scope.supplierId || p.supplierId === scope.supplierId);
      return { items: rows, total: rows.length, page, limit };
    },
    async create(input: NewProduct, audit) {
      if (items.some((p) => p.supplierId === input.supplierId && p.name === input.name)) {
        throw conflict("Bu mahsulot allaqachon qo'shilgan. Mavjudini tahrirlang.");
      }
      const p: Product = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, ...input };
      items.push(p);
      audits.push(audit(p));
      return p;
    },
    async update(id, patch: ProductPatch, audit) {
      const p = items.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, patch);
      audits.push(audit(p));
      return p;
    },
    async remove(id, audit) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const [p] = items.splice(i, 1);
      audits.push(audit(p!));
      return p!;
    },
  };
  return { repo, items, audits, scopes };
}

export const prod = (id: string, supplierId: string, name = "Sut", unit: Product["unit"] = "L"): Product => ({
  id, supplierId, name, unit, availableToday: 5, dailyCapacity: 10, pricePerUnit: 12000,
});
