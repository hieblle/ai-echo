/**
 * The ONLY place that talks to Microsoft (D4.10, docs/COPILOT-INTEGRATION.md):
 * admin-consent URL for the multi-tenant Entra app, client-credentials
 * tokens per customer tenant, and the Copilot usage reports as CSV from
 * Microsoft Graph (`/copilot/reports/…`, GA v1.0). Server-only.
 *
 * The report endpoints answer with a 302 to a pre-authorised download URL.
 * Redirects are followed by hand so the bearer token is never forwarded to
 * that second host.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { M365Env } from "./env";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const LOGIN_BASE = "https://login.microsoftonline.com";
/** Application permission the app needs; shown to the customer's admin at consent. */
export const REQUIRED_PERMISSION = "Reports.Read.All";

export interface CopilotReportFetcher {
  fetchUserDetailCsv(tenantId: string, periodDays: number): Promise<string>;
  fetchSummaryCsv(tenantId: string, periodDays: number): Promise<string>;
  /** Tenant setting "conceal user names in reports"; null when not readable. */
  readNamesConcealed(tenantId: string): Promise<boolean | null>;
}

export class GraphError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Microsoft Graph ${status}: ${detail}`);
    this.name = "GraphError";
    this.status = status;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GraphClient implements CopilotReportFetcher {
  private readonly env: M365Env;
  private readonly fetchImpl: FetchLike;
  private readonly tokens = new Map<string, { value: string; expiresAt: number }>();

  constructor(env: M365Env, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  /** Client-credentials token for one customer tenant (cached until shortly before expiry). */
  async accessToken(tenantId: string): Promise<string> {
    const cached = this.tokens.get(tenantId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const body = new URLSearchParams({
      client_id: this.env.clientId,
      client_secret: this.env.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
    const res = await this.fetchImpl(`${LOGIN_BASE}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new GraphError(res.status, await safeErrorText(res));
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new GraphError(res.status, "token response without access_token");
    this.tokens.set(tenantId, {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    });
    return json.access_token;
  }

  /** GET a report function; follows the 302 to the download URL without the bearer token. */
  async fetchReportCsv(tenantId: string, fn: string): Promise<string> {
    const token = await this.accessToken(tenantId);
    const first = await this.fetchImpl(`${GRAPH_BASE}/copilot/reports/${fn}`, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "manual",
    });
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get("location");
      if (!location) throw new GraphError(first.status, "redirect without location");
      const download = await this.fetchImpl(location, { redirect: "follow" });
      if (!download.ok) throw new GraphError(download.status, await safeErrorText(download));
      return download.text();
    }
    if (!first.ok) throw new GraphError(first.status, await safeErrorText(first));
    return first.text();
  }

  fetchUserDetailCsv(tenantId: string, periodDays: number): Promise<string> {
    return this.fetchReportCsv(
      tenantId,
      `getMicrosoft365CopilotUsageUserDetail(period='D${periodDays}',version='v2')`,
    );
  }

  fetchSummaryCsv(tenantId: string, periodDays: number): Promise<string> {
    return this.fetchReportCsv(
      tenantId,
      `getMicrosoft365CopilotUserCountSummary(period='D${periodDays}',version='v2')`,
    );
  }

  async readNamesConcealed(tenantId: string): Promise<boolean | null> {
    try {
      const token = await this.accessToken(tenantId);
      const res = await this.fetchImpl(`${GRAPH_BASE}/admin/reportSettings`, {
        headers: { authorization: `Bearer ${token}` },
      });
      // Needs ReportSettings.Read.All, which the app may not have — optional.
      if (!res.ok) return null;
      const json = (await res.json()) as { displayConcealedNames?: boolean };
      return typeof json.displayConcealedNames === "boolean" ? json.displayConcealedNames : null;
    } catch {
      return null;
    }
  }
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 300) || res.statusText;
  } catch {
    return res.statusText;
  }
}

// --- Admin consent ---------------------------------------------------------------

/** Where the customer's Global Admin grants the app its permission. */
export function adminConsentUrl(env: M365Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: redirectUri,
    state,
  });
  return `${LOGIN_BASE}/organizations/adminconsent?${params.toString()}`;
}

const STATE_TTL_MS = 15 * 60_000;

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`m365-consent:${payload}`).digest("base64url");
}

/** Signed, time-limited state binding the consent round trip to one org. */
export function signConsentState(secret: string, slug: string, now = Date.now()): string {
  const payload = base64url(JSON.stringify({ slug, exp: now + STATE_TTL_MS }));
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyConsentState(
  secret: string,
  state: string,
  now = Date.now(),
): { slug: string } | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = sign(secret, payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      slug?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.slug !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < now) return null;
    return { slug: parsed.slug };
  } catch {
    return null;
  }
}
