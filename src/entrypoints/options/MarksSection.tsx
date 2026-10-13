import { useEffect, useState } from "react";
import type { TermStatus } from "@/shared/types";
import { getMarkSettings, OPACITY_LEVELS, setMarkSettings, type MarkSettings } from "@/storage/markSettings";

// Renkler content/marks.css ile aynıdır.
const STATUSES: { value: TermStatus; label: string; hint: string; color: string; sample: string }[] = [
  { value: "unknown", label: "Bilmiyorum", hint: "Bilmediğin kelimeler kırmızı renklenir.", color: "226 70 58", sample: "running" },
  { value: "learning", label: "Az biliyorum", hint: "Az bildiğin kelimeler sarı renklenir.", color: "224 160 0", sample: "carried out" },
  { value: "known", label: "Biliyorum", hint: "Bildiğin kelimeler yeşil renklenir.", color: "26 138 74", sample: "bridge" },
];

/** Sayfadaki otomatik renklendirme: durum başına aç/kapa ve ortak renk yoğunluğu. */
export default function MarksSection() {
  const [settings, setSettings] = useState<MarkSettings | null>(null);
  useEffect(() => void getMarkSettings().then(setSettings), []);

  if (!settings) return null;

  const update = (next: MarkSettings) => {
    setSettings(next);
    void setMarkSettings(next);
  };

  return (
    <section>
      <h2>Sayfadaki işaretler</h2>

      <div className="rows">
        {STATUSES.map((status) => (
          <label className="row" key={status.value}>
            <span>
              <strong>{status.label}</strong>
              <small>{status.hint}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.show[status.value]}
              onChange={(e) => update({ ...settings, show: { ...settings.show, [status.value]: e.target.checked } })}
            />
          </label>
        ))}

        <label className="row">
          <span>
            <strong>Renk yoğunluğu</strong>
            <small>%{settings.opacity} — düşük değer daha şeffaf.</small>
          </span>
          <input
            type="range"
            min={OPACITY_LEVELS[0]}
            max={OPACITY_LEVELS[OPACITY_LEVELS.length - 1]}
            step={10}
            value={settings.opacity}
            onChange={(e) => update({ ...settings, opacity: Number(e.target.value) as MarkSettings["opacity"] })}
          />
        </label>
      </div>

      <p className="preview">
        The{" "}
        {STATUSES.map((status) => (
          <span key={status.value}>
            <span style={settings.show[status.value] ? { backgroundColor: `rgb(${status.color} / ${settings.opacity / 100})` } : undefined}>
              {status.sample}
            </span>{" "}
          </span>
        ))}
        example.
      </p>
    </section>
  );
}
