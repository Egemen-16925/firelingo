import { browser } from "wxt/browser";
import type { TermStatus } from "@/shared/types";

export const MARK_SETTINGS_KEY = "markSettings";

/** Renk yoğunluğu basamakları (yüzde). marks.css her basamak için hazır bir kural içerir. */
export const OPACITY_LEVELS = [10, 20, 30, 40, 50, 60] as const;

/** Sayfadaki işaretler: hangi durumdaki kelimeler renklensin ve ne kadar yoğun. */
export interface MarkSettings {
  show: Record<TermStatus, boolean>;
  opacity: (typeof OPACITY_LEVELS)[number];
}

export const DEFAULT_MARK_SETTINGS: MarkSettings = {
  show: { unknown: true, learning: true, known: false },
  opacity: 30,
};

export async function getMarkSettings(): Promise<MarkSettings> {
  const stored = (await browser.storage.local.get(MARK_SETTINGS_KEY))[MARK_SETTINGS_KEY] as Partial<MarkSettings> | undefined;
  return { ...DEFAULT_MARK_SETTINGS, ...stored, show: { ...DEFAULT_MARK_SETTINGS.show, ...stored?.show } };
}

export async function setMarkSettings(settings: MarkSettings): Promise<void> {
  await browser.storage.local.set({ [MARK_SETTINGS_KEY]: settings });
}

/** Vurgu adı; marks.css içindeki `::highlight(...)` kurallarıyla aynı olmalı. */
export const highlightName = (status: TermStatus, opacity: number) => `firelingo-${status}-${opacity}`;
