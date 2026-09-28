import { describe, expect, it } from "vitest";
import {
  GraphClient,
  GraphError,
  adminConsentUrl,
  signConsentState,
  verifyConsentState,
} from "./m365-graph";

const env = { clientId: "app-id", clientSecret: "app-secret" };

interface Call {
  url: string;
  init?: RequestInit;
}

function fakeFetch(calls: Call[]) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (url.includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/copilot/reports/getMicrosoft365CopilotUsageUserDetail")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://reports.example.net/download/abc" },
      });
    }
    if (url.startsWith("https://reports.example.net/")) {
      return new Response("Report Refresh Date,User Principal Name\n2026-09-25,x", { status: 200 });
    }
    if (url.includes("/admin/reportSettings")) {
      return new Response(JSON.stringify({ displayConcealedNames: true }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

describe("GraphClient", () => {
  it("requests a client-credentials token per tenant and reuses it", async () => {
    const calls: Call[] = [];
    const client = new GraphClient(env, fakeFetch(calls));
    await client.accessToken("tenant-a");
    await client.accessToken("tenant-a");
    const tokenCalls = calls.filter((c) => c.url.includes("/oauth2/v2.0/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]?.url).toBe("https://login.microsoftonline.com/tenant-a/oauth2/v2.0/token");
    expect(String(tokenCalls[0]?.init?.body)).toContain("grant_type=client_credentials");
    expect(String(tokenCalls[0]?.init?.body)).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
  });

  it("follows the report redirect by hand and never forwards the bearer token", async () => {
    const calls: Call[] = [];
    const client = new GraphClient(env, fakeFetch(calls));
    const csv = await client.fetchUserDetailCsv("tenant-a", 28);
    expect(csv).toContain("Report Refresh Date");
    const report = calls.find((c) => c.url.includes("/copilot/reports/"));
    expect(report?.url).toBe(
      "https://graph.microsoft.com/v1.0/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='D28',version='v2')",
    );
    expect(report?.init?.redirect).toBe("manual");
    const download = calls.find((c) => c.url.startsWith("https://reports.example.net/"));
    expect(download).toBeDefined();
    const headers = (download?.init?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("reads the concealment setting and treats a refusal as unknown", async () => {
    const calls: Call[] = [];
    const client = new GraphClient(env, fakeFetch(calls));
    expect(await client.readNamesConcealed("tenant-a")).toBe(true);
    const refusing = new GraphClient(env, async (url) =>
      url.includes("/oauth2/") ? fakeFetch([])(url) : new Response("forbidden", { status: 403 }),
    );
    expect(await refusing.readNamesConcealed("tenant-a")).toBeNull();
  });

  it("surfaces Graph errors with their status", async () => {
    const client = new GraphClient(env, async (url) =>
      url.includes("/oauth2/")
        ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
        : new Response("no licence", { status: 403 }),
    );
    await expect(client.fetchSummaryCsv("tenant-a", 7)).rejects.toThrow(GraphError);
  });
});

describe("admin consent", () => {
  it("builds the organizations consent URL with the app id and redirect", () => {
    const url = adminConsentUrl(env, "https://app.example/api/integrations/m365/callback", "st");
    expect(url).toBe(
      "https://login.microsoftonline.com/organizations/adminconsent?client_id=app-id&redirect_uri=https%3A%2F%2Fapp.example%2Fapi%2Fintegrations%2Fm365%2Fcallback&state=st",
    );
  });

  it("signs a state that round-trips, expires and detects tampering", () => {
    const now = Date.UTC(2026, 8, 28, 8, 0, 0);
    const state = signConsentState("secret", "moorbach", now);
    expect(verifyConsentState("secret", state, now + 60_000)).toEqual({ slug: "moorbach" });
    expect(verifyConsentState("secret", state, now + 16 * 60_000)).toBeNull();
    expect(verifyConsentState("other", state, now)).toBeNull();
    const [payload, sig] = state.split(".");
    const forged = `${Buffer.from(JSON.stringify({ slug: "other", exp: now + 60_000 })).toString("base64url")}.${sig}`;
    expect(verifyConsentState("secret", forged, now)).toBeNull();
    expect(verifyConsentState("secret", `${payload}`, now)).toBeNull();
  });
});
