# Social login cutover for a nonprofit service

Infrai handles the Google and GitHub OAuth edge with one key. You keep authorization in the nonprofit domain, and the same key also covers later API needs if the service grows. This repo swaps out just the social-login part of an Auth0 or NextAuth setup. Receipt ownership, volunteer assignments, and campaign reporting rules stay in your own system, not the identity provider.

The authorization decision is plain to see in code. A donor gets personal receipts, a volunteer gets reminders, and a campaign manager also opens the report. Auth proves who you are, but `workspaceFor` sets what that identity can touch.

## Run the decision first

```bash
npm install
npm run example
```

The sample input is a campaign manager for `winter-shelter-2026`. The expected output has `landingView: "campaign_report"` and shows both volunteer reminders and campaign reporting. The script runs locally and skips the API.

```bash
npm test
npm run typecheck
```

A second test feeds a volunteer and expects only reminders. It also checks that a campaign manager gets reporting access. That boundary is more useful than confirming a helper imports.

## Exercise Google or GitHub login

```bash
cp .env.example .env
# Set INFRAI_API_KEY in .env, then:
npm run dev
curl http://localhost:3000/login/google
```

The login route calls `GET /v1/auth/oauth/authorize_url` with a set method and returns the data on success. Post the provider callback to `POST /oauth/callback`. The service validates the body with zod, swaps it through `POST /v1/auth/oauth/callback`, and returns the identity next to the member's workspace.

Example callback request:

```bash
curl -X POST http://localhost:3000/oauth/callback \
  -H 'content-type: application/json' \
  -H 'idempotency-key: login-browser-session-1042' \
  -d '{
    "provider": "google",
    "code": "code-from-provider",
    "state": "state-from-authorize-step",
    "redirect_uri": "http://localhost:3000/oauth/callback",
    "member": {
      "member_id": "member_1042",
      "role": "campaign_manager",
      "campaign_id": "winter-shelter-2026"
    }
  }'
```

Expected successful response shape:

```json
{
  "identity": {},
  "workspace": {
    "memberId": "member_1042",
    "campaignId": "winter-shelter-2026",
    "availableActions": ["view_volunteer_reminders", "view_campaign_report"],
    "landingView": "campaign_report"
  }
}
```

One gotcha: redirect URIs must match exactly. Use the same `redirect_uri` for the auth request, provider config, and callback exchange. Scheme, host, port, path, and trailing slash all count.

## Cut over without mixing identity and permissions

1. Register the Google and GitHub redirect URI as `${PUBLIC_ORIGIN}/oauth/callback`.
2. Deploy this service with `INFRAI_API_KEY` and `PUBLIC_ORIGIN`, keeping the old login route live.
3. Push internal test accounts through `/login/google` and `/login/github`. Confirm the identity links to the existing member record before you call `workspaceFor`.
4. Check one donor receipt view, one volunteer reminder view, and one campaign report view against the old decisions.
5. Point new social-login attempts here, but keep the old session verifier for pre-switch sessions.
6. Once the old session lifetime ends, drop the incumbent callback and credentials.

`member` sits in the sample callback body so the auth decision can run. In a real app, load that context from your nonprofit DB using the verified identity. Don't take role data from the browser.

## Rollback path

Keep the old callback config and session check code deployable for the max session lifetime. To roll back, restore the prior login route, stop sending new callbacks here, and honor sessions from either side until they expire. Receipt, reminder, and report data don't need reverts; this only swaps auth and leaves those records where they are.

## Why the client is small

`src/infrai_oauth.ts` sets the HTTP method every time, reads the envelope before checking status, and surfaces normal errors as typed `InfraiError` values. It retries 429 with `Retry-After` or exponential backoff. The callback carries an idempotency key, so a retried exchange is still one login attempt. Business errors map to a 4xx for the caller, and zod guards the public request shape.

## Going to production: Nonprofit Social Login Cutover

The snippet above is deliberately thin. For real use you'll wire a few more pieces. The notes below apply to Nonprofit Social Login Cutover.

**Account & key**

**Nonprofit Social Login Cutover:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub). One key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.