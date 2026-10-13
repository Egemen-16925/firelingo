import { serialized } from "@/terms/terms";
import { applyShared, mergeShared, parseSnapshot, readShared } from "./snapshot";

export interface ImportSummary {
  added: number;
  updated: number;
  removed: number;
  /** İçe aktarmadan sonraki toplam kelime sayısı. */
  total: number;
}

/**
 * Eşitleme biçimindeki JSON'u yerel veriyle birleştirir (mevcut veri silinmez). Kelime
 * yazmalarıyla aynı sırada çalışır; yalnızca background'da kullanılır.
 */
export function importSnapshot(json: string): Promise<ImportSummary> {
  return serialized(async () => {
    const incoming = parseSnapshot(json);
    const local = await readShared();
    const merged = mergeShared(local, incoming);
    await applyShared(merged);

    const before = new Map(local.terms.map((t) => [t.key, t.updatedAt]));
    const after = new Map(merged.terms.map((t) => [t.key, t.updatedAt]));
    return {
      added: [...after.keys()].filter((key) => !before.has(key)).length,
      updated: [...after].filter(([key, updatedAt]) => before.has(key) && before.get(key) !== updatedAt).length,
      removed: [...before.keys()].filter((key) => !after.has(key)).length,
      total: after.size,
    };
  });
}
