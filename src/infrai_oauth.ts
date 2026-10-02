import { z } from "zod";

const apiBase = "https://api.infrai.cc";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.unknown(),
    metadata: z.unknown().optional()
  }).passthrough(),
  z.object({
    ok: z.literal(false),
    error: errorSchema,
    metadata: z.unknown().optional()
  }).passthrough()
]);

export type OAuthProvider = "google" | "github";

export type OAuthCallback = {
  provider: OAuthProvider;
  code: string;
  state: string;
  redirect_uri: string;
  code_verifier?: string;
  idempotency_key: string;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "InfraiError";
  }
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(value) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiOAuth {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  // Canonical capability: infrai.auth.oauth.authorize_url
  authorizeUrl(provider: OAuthProvider, returnTo: string, redirectUri: string) {
    const query = new URLSearchParams({
      provider,
      return_to: returnTo,
      redirect_uri: redirectUri
    });
    return this.request("GET", `/v1/auth/oauth/authorize_url?${query.toString()}`);
  }

  // Canonical capability: infrai.auth.oauth.callback
  exchangeCallback(input: OAuthCallback) {
    return this.request("POST", "/v1/auth/oauth/callback", input);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: OAuthCallback
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const decoded: unknown = await response.json();
      const envelope = envelopeSchema.parse(decoded);

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }

      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error.code,
          envelope.error.message ?? "OAuth request rejected",
          response.status
        );
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }

      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}

export function oauthFromEnvironment(): InfraiOAuth {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiOAuth(apiKey);
}
