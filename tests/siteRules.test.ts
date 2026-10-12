import { describe, expect, it } from "vitest";
import { hostnameOf, resolveEnabled } from "../src/shared/siteRules";

describe("resolveEnabled", () => {
  it("is off by default", () => {
    expect(resolveEnabled({ globalOn: false })).toBe(false);
  });

  it("follows the global switch when nothing else is set", () => {
    expect(resolveEnabled({ globalOn: true })).toBe(true);
  });

  it("lets the tab override beat the global switch", () => {
    expect(resolveEnabled({ tabOverride: true, globalOn: false })).toBe(true);
    expect(resolveEnabled({ tabOverride: false, globalOn: true })).toBe(false);
  });

  it("lets the site rule beat both the tab override and the global switch", () => {
    expect(resolveEnabled({ rule: "always_off", tabOverride: true, globalOn: true })).toBe(false);
    expect(resolveEnabled({ rule: "always_on", tabOverride: false, globalOn: false })).toBe(true);
  });
});

describe("hostnameOf", () => {
  it("returns the exact hostname, keeping subdomains apart", () => {
    expect(hostnameOf("https://en.wikipedia.org/wiki/Fire")).toBe("en.wikipedia.org");
    expect(hostnameOf("http://example.com:8080/a?b#c")).toBe("example.com");
  });

  it("returns null for pages the extension does not run on", () => {
    expect(hostnameOf("about:debugging")).toBeNull();
    expect(hostnameOf("file:///C:/notes.html")).toBeNull();
    expect(hostnameOf("moz-extension://abc/popup.html")).toBeNull();
    expect(hostnameOf("not a url")).toBeNull();
  });
});
