export type SiteRule = "always_on" | "always_off";

export interface EnableInputs {
  /** Bu hostname için kalıcı kural (varsa). */
  rule?: SiteRule;
  /** Bu sekme için oturumluk seçim (varsa). */
  tabOverride?: boolean;
  /** "Her sitede açık" anahtarı. */
  globalOn: boolean;
}

/** Öncelik: site kuralı > sekme oturum ayarı > global ayar. */
export function resolveEnabled({ rule, tabOverride, globalOn }: EnableInputs): boolean {
  if (rule) return rule === "always_on";
  return tabOverride ?? globalOn;
}

/** Kural anahtarı tam hostname'dir (alt alan adları ayrı sayılır). http/https dışındaki adreslerde null. */
export function hostnameOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "http:" || protocol === "https:") && hostname ? hostname : null;
  } catch {
    return null;
  }
}
