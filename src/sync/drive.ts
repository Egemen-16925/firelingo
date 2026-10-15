import { serialized } from "@/terms/terms";
import { downloadSyncFile, fileVersion, findSyncFile, uploadSyncFile } from "./google";
import { applyShared, mergeShared, parseSnapshot, readShared, toSnapshot, type Shared, type Snapshot } from "./snapshot";

const EMPTY: Shared = { terms: [], occurrences: [], sentences: [], tombstones: [] };
/** Karşılaştırma için sıralı ve tekilleştirilmiş hâli. */
const normalize = (shared: Shared) => JSON.stringify(mergeShared(shared, EMPTY));
const sharedOf = ({ terms, occurrences, sentences, tombstones }: Snapshot): Shared => ({ terms, occurrences, sentences, tombstones });

/** Başka bir uygulama (DuoPDF) bu arada yazarsa en çok bu kadar kez yeniden denenir. */
const ATTEMPTS = 3;

export interface SyncOutcome {
  /** Buluttan yerel veriye değişiklik geldi mi. */
  changedLocally: boolean;
  /** Buluttaki dosya yazıldı mı. */
  uploaded: boolean;
  /** Eşitlemeden sonraki ortak verinin özeti (sonradan değişiklik var mı diye bakmak için). */
  fingerprint: string;
}

/**
 * Drive'daki `duopdf-sync.json` ile yerel veriyi eşitler: dosyayı indirir, kayıt kayıt birleştirir
 * (Faz 4'teki kurallar), sonucu yerel veriye işler ve değiştiyse dosyayı geri yazar.
 *
 * - DuoPDF'e ait bölümler (belgeler, çizimler, sınav cevapları) okunup olduğu gibi geri yazılır.
 * - Yazmadan hemen önce dosyanın sürümüne yeniden bakılır; bu arada başkası yazdıysa baştan alınır.
 * - Yerel veriye işleme, kelime yazmalarıyla aynı sırada yapılır (bu arada işaretlenen kelime kaybolmaz).
 */
export async function syncWithDrive(token: string): Promise<SyncOutcome> {
  let changedLocally = false;
  for (let attempt = 1; ; attempt++) {
    const file = await findSyncFile(token);
    const remote: Snapshot = file ? parseSnapshot(await downloadSyncFile(token, file.id)) : toSnapshot(EMPTY);

    const merged = await serialized(async () => {
      const local = await readShared();
      const result = mergeShared(local, sharedOf(remote));
      if (normalize(local) !== normalize(result)) {
        await applyShared(result);
        changedLocally = true;
      }
      return result;
    });
    const fingerprint = normalize(merged);

    if (file && normalize(sharedOf(remote)) === fingerprint) return { changedLocally, uploaded: false, fingerprint };
    if (file && (await fileVersion(token, file.id)) !== file.version) {
      if (attempt < ATTEMPTS) continue;
      throw new Error("Eşitleme dosyası sürekli değişiyor (DuoPDF aynı anda eşitliyor olabilir). Biraz sonra tekrar dene.");
    }
    // Firelingo'nun bölümleri birleşik veriyle değişir; geri kalan her şey buluttaki gibi kalır.
    const out: Snapshot = { ...remote, ...toSnapshot(merged), documents: remote.documents, strokes: remote.strokes, quizAttempts: remote.quizAttempts };
    await uploadSyncFile(token, file?.id ?? null, JSON.stringify(out));
    return { changedLocally, uploaded: true, fingerprint };
  }
}

/** Yerel verinin özeti; son eşitlemedekiyle aynıysa yeni eşitlemeye gerek yoktur. */
export async function localFingerprint(): Promise<string> {
  return normalize(await readShared());
}
