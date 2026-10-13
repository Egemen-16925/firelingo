import { useEffect, useState } from "react";
import { getPenSettings, PEN_COLORS, setPenSettings, type PenColor, type PenSettings } from "@/storage/penSettings";

const NUMBERS: { field: "delaySeconds" | "fadeSeconds" | "maxStrokes"; label: string; hint: string; min: number; max: number; step: number }[] = [
  { field: "delaySeconds", label: "Solma gecikmesi (sn)", hint: "Yeni iz çizmezsen izin solmaya başlamasına kadar geçen süre.", min: 0.5, max: 30, step: 0.5 },
  { field: "fadeSeconds", label: "Solma süresi (sn)", hint: "İzin tamamen kaybolması ne kadar sürsün.", min: 0.2, max: 10, step: 0.1 },
  { field: "maxStrokes", label: "En fazla iz", hint: "Aynı anda görünen iz sayısı; aşılınca en eskisi kalkar.", min: 1, max: 10, step: 1 },
];

/** Geçici fosforlu kalem: renk ve solma davranışı. */
export default function PenSection() {
  const [settings, setSettings] = useState<PenSettings | null>(null);
  useEffect(() => void getPenSettings().then(setSettings), []);

  if (!settings) return null;

  const update = (patch: Partial<PenSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void setPenSettings(next);
  };

  return (
    <section>
      <h2>Fosforlu kalem</h2>
      <p className="hint lead">
        Kalemi popup'taki düğmeyle ya da Alt+Shift+H ile aç: sayfada taşıyabileceğin küçük bir kalem paneli çıkar. Metnin üzerinden çizince iz
        geçici olarak kalır ve bırakınca üzerinden geçtiğin kelime ya da cümlenin çevirisi açılır. Renk panelden de değiştirilebilir.
        Kısayolu Firefox'ta Eklentiler → çark simgesi → “Eklenti kısayollarını yönet”ten değiştirebilirsin.
      </p>

      <div className="rows">
        <div className="row">
          <span>
            <strong>Renk</strong>
          </span>
          <div className="swatches" role="radiogroup" aria-label="Kalem rengi">
            {(Object.keys(PEN_COLORS) as PenColor[]).map((color) => (
              <button
                key={color}
                role="radio"
                aria-checked={settings.color === color}
                aria-label={PEN_COLORS[color].label}
                title={PEN_COLORS[color].label}
                style={{ backgroundColor: PEN_COLORS[color].value }}
                onClick={() => update({ color })}
              />
            ))}
          </div>
        </div>

        {NUMBERS.map((n) => (
          <label className="row" key={n.field}>
            <span>
              <strong>{n.label}</strong>
              <small>{n.hint}</small>
            </span>
            <input
              type="number"
              min={n.min}
              max={n.max}
              step={n.step}
              value={settings[n.field]}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= n.min && value <= n.max) update({ [n.field]: value });
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
