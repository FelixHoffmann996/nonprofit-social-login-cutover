import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiError, oauthFromEnvironment } from "./infrai_oauth.ts";
import { workspaceFor } from "./nonprofit_access.ts";

const providerSchema = z.enum(["google", "github"]);
const memberContextSchema = z.object({
  member_id: z.string().min(1),
  role: z.enum(["donor", "volunteer", "campaign_manager"]),
  campaign_id: z.string().min(1)
});
const callbackSchema = z.object({
  provider: providerSchema,
  code: z.string().min(1),
  state: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(1).optional(),
  member: memberContextSchema
});

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createNonprofitLoginService() {
  const oauth = oauthFromEnvironment();
  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", origin);

      if (request.method === "GET" && url.pathname.startsWith("/login/")) {
        const provider = providerSchema.parse(url.pathname.split("/").at(-1));
        const data = await oauth.authorizeUrl(
          provider,
          `${origin}/signed-in`,
          `${origin}/oauth/callback`
        );
        send(response, 200, data);
        return;
      }

      if (request.method === "POST" && url.pathname === "/oauth/callback") {
        const input = callbackSchema.parse(await readJson(request));
        const identity = await oauth.exchangeCallback({
          provider: input.provider,
          code: input.code,
          state: input.state,
          redirect_uri: input.redirect_uri,
          code_verifier: input.code_verifier,
          idempotency_key: request.headers["idempotency-key"]?.toString() ?? randomUUID()
        });
        send(response, 200, {
          identity,
          workspace: workspaceFor(input.member)
        });
        return;
      }

      send(response, 404, { error: "route_not_found" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        send(response, 400, { error: "invalid_request", details: error.flatten() });
        return;
      }
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        send(response, status, { error: error.code, message: error.message });
        return;
      }
      send(response, 500, { error: "service_error" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createNonprofitLoginService().listen(port, () => {
    console.log(`Nonprofit login service listening on http://localhost:${port}`);
  });
}
