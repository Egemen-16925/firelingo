import { describe, expect, it } from "vitest";
import { checkPassword, newPasswordKey, openWith, sealWith } from "../src/storage/vault";

const randomKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

describe("sealWith / openWith", () => {
  it("round-trips a secret without leaving it readable", async () => {
    const key = await randomKey();
    const sealed = await sealWith(key, "nvapi-secret-123");
    expect(sealed).not.toContain("nvapi-secret-123");
    expect(await openWith(key, sealed)).toBe("nvapi-secret-123");
  });

  it("uses a fresh IV, so the same secret seals differently each time", async () => {
    const key = await randomKey();
    expect(await sealWith(key, "same")).not.toBe(await sealWith(key, "same"));
  });

  it("keeps an empty secret empty (providers without a key)", async () => {
    const key = await randomKey();
    expect(await sealWith(key, "")).toBe("");
    expect(await openWith(key, "")).toBe("");
  });

  it("fails with a clear message under the wrong key or on tampered data", async () => {
    const sealed = await sealWith(await randomKey(), "secret");
    await expect(openWith(await randomKey(), sealed)).rejects.toThrow("çözülemedi");
    await expect(openWith(await randomKey(), "not-valid")).rejects.toThrow("çözülemedi");
  });
});

describe("master password", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const { key, meta } = await newPasswordKey("correct horse");
    const sealed = await sealWith(key, "secret");

    const unlocked = await checkPassword("correct horse", meta);
    expect(unlocked).toBeDefined();
    expect(await openWith(unlocked!, sealed)).toBe("secret");

    expect(await checkPassword("wrong horse", meta)).toBeUndefined();
  });

  it("stores only a salt and a sealed check, never the password", async () => {
    const { meta } = await newPasswordKey("correct horse");
    expect(JSON.stringify(meta)).not.toContain("correct horse");
    expect(Object.keys(meta).sort()).toEqual(["check", "salt"]);
  });
});
