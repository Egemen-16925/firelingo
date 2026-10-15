import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { DRIVE_SCOPE, DrivePermissionMissing, redirectUri, signIn } from "@/sync/google";

const client = { clientId: "id.apps.googleusercontent.com", clientSecret: "secret" };
let authUrl: URL;
let tokenBody: URLSearchParams;
let grantedScope: string;
let revoked: string[];

function idToken(email: string) {
  const payload = btoa(JSON.stringify({ email })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `x.${payload}.y`;
}

beforeEach(() => {
  fakeBrowser.reset();
  grantedScope = `openid email ${DRIVE_SCOPE}`;
  revoked = [];
  const identity = fakeBrowser.identity as unknown as Record<string, unknown>;
  identity.getRedirectURL = () => "https://0a1b2c3d4e.extensions.allizom.org/";
  identity.launchWebAuthFlow = async ({ url }: { url: string }) => {
    authUrl = new URL(url);
    return `${authUrl.searchParams.get("redirect_uri")}?state=${authUrl.searchParams.get("state")}&code=good-code`;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith("https://oauth2.googleapis.com/revoke")) {
        revoked.push(new URL(input).searchParams.get("token")!);
        return new Response("");
      }
      tokenBody = new URLSearchParams(String(init!.body));
      return new Response(
        JSON.stringify({ access_token: "access", expires_in: 3600, refresh_token: "refresh", scope: grantedScope, id_token: idToken("ege@example.com") }),
        { status: 200 },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signIn", () => {
  it("uses Firefox's loopback redirect so Google's desktop client accepts it", () => {
    expect(redirectUri()).toBe("http://127.0.0.1/mozoauth2/0a1b2c3d4e");
  });

  it("asks only for the app folder, with PKCE and offline access, and exchanges the code", async () => {
    const tokens = await signIn(client);
    expect(authUrl.searchParams.get("scope")).toBe(`openid email ${DRIVE_SCOPE}`);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(tokenBody.get("code")).toBe("good-code");
    expect(tokenBody.get("redirect_uri")).toBe("http://127.0.0.1/mozoauth2/0a1b2c3d4e");
    expect(tokenBody.get("code_verifier")).toBeTruthy();
    expect(tokens).toMatchObject({ accessToken: "access", refreshToken: "refresh", email: "ege@example.com" });
  });

  it("rejects an answer whose state does not match", async () => {
    (fakeBrowser.identity as unknown as Record<string, unknown>).launchWebAuthFlow = async () => "http://127.0.0.1/mozoauth2/x?state=forged&code=c";
    await expect(signIn(client)).rejects.toThrow("state");
  });

  it("revokes and explains when the Drive box was left unticked", async () => {
    grantedScope = "openid email";
    await expect(signIn(client)).rejects.toBeInstanceOf(DrivePermissionMissing);
    expect(revoked).toEqual(["refresh"]);
  });

  it("reports a closed sign-in window in Turkish", async () => {
    (fakeBrowser.identity as unknown as Record<string, unknown>).launchWebAuthFlow = async () => {
      throw new Error("User cancelled or denied access.");
    };
    await expect(signIn(client)).rejects.toThrow("vazgeçildi");
  });
});
