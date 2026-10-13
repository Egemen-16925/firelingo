import { browser } from "wxt/browser";

export const PEN_SETTINGS_KEY = "penSettings";

export const PEN_COLORS = {
  yellow: { label: "Sarı", value: "#ffe600" },
  green: { label: "Yeşil", value: "#5fe36a" },
  pink: { label: "Pembe", value: "#ff7ac0" },
  blue: { label: "Mavi", value: "#5ab8ff" },
} as const;

export type PenColor = keyof typeof PEN_COLORS;

/** Geçici fosforlu kalem ayarları. */
export interface PenSettings {
  color: PenColor;
  /** Yeni iz çizilmezse vurgunun solmaya başlamasına kadar geçen süre. */
  delaySeconds: number;
  /** Solmanın süresi. */
  fadeSeconds: number;
  /** Aynı anda görünen en fazla vurgu sayısı. */
  maxStrokes: number;
  /** Sayfadaki kalem panelinin konumu (pencerenin sol üstünden); taşınmadıysa yok. */
  position?: { x: number; y: number };
}

export const DEFAULT_PEN_SETTINGS: PenSettings = { color: "yellow", delaySeconds: 3, fadeSeconds: 1.5, maxStrokes: 3 };

export async function getPenSettings(): Promise<PenSettings> {
  const stored = (await browser.storage.local.get(PEN_SETTINGS_KEY))[PEN_SETTINGS_KEY] as Partial<PenSettings> | undefined;
  return { ...DEFAULT_PEN_SETTINGS, ...stored };
}

export async function setPenSettings(settings: PenSettings): Promise<void> {
  await browser.storage.local.set({ [PEN_SETTINGS_KEY]: settings });
}
