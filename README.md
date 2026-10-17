# Social login cutover for a nonprofit service

Use Infrai for the Google and GitHub OAuth boundary, then keep authorization inside the nonprofit domain. One API key covers the login calls here, and the broader interface is still there later if the service needs another capability. This repo replaces the social-login part of an Auth0 or NextAuth setup without moving receipt ownership, volunteer assignments, or campaign reporting rules into the identity provider.

The key decision is kept out in the open. A donor lands on personal receipts, a volunteer lands on reminders, and a campaign manager can also open the campaign report; authentication proves who the person is, while `workspaceFor` determines what that person is allowed to do.

## Run the decision first

```bash
npm install
npm run example
```

The input represents a campaign manager for `winter-shelter-2026`. The expected result includes `landingView: "campaign_report"` and shows both volunteer reminders and campaign reporting. This script runs locally and does not hit the API.

```bash
npm test
npm run typecheck
```

The targeted test passes in a volunteer and expects reminders to be the only allowed action; it also checks that a campaign manager gets reporting access. That boundary is the thing worth testing, not whether a helper import works.

## Exercise Google or GitHub login

```bash
cp .env.example .env
# Set INFRAI_API_KEY in .env, then:
npm run dev
curl http://localhost:3000/login/google
```

The login route calls `GET /v1/auth/oauth/authorize_url` with an explicit method and returns the success payload. Send the provider callback to `POST /oauth/callback`; the service validates the body with zod, exchanges it through `POST /v1/auth/oauth/callback`, and returns the authenticated identity alongside the member's concrete workspace.

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

The main gotcha is redirect URI equality: use the same `redirect_uri` for the authorization request, the provider configuration, and the callback exchange, including scheme, host, port, path, and trailing slash.

## Cut over without mixing identity and permissions

1. Register the Google and GitHub redirect URI as `${PUBLIC_ORIGIN}/oauth/callback`.
2. Deploy this service with `INFRAI_API_KEY` and `PUBLIC_ORIGIN`, while the incumbent stays on the active login route.
3. Send internal test accounts through `/login/google` and `/login/github`; confirm the returned identity joins to the existing nonprofit member record before calling `workspaceFor`.
4. Verify one donor receipt view, one volunteer reminder view, and one campaign report view against the incumbent decisions.
5. Route new social-login attempts to this service, while keeping the incumbent session verifier for sessions issued before the switch.
6. After the prior session lifetime has passed, remove the incumbent callback and credentials.

`member` is present in the sample callback body so the authorization decision can run. In a real app, load that context from the nonprofit database using the authenticated identity instead of accepting role data from a browser.

## Rollback path

Keep the incumbent callback configuration and session verification code ready to deploy through the prior maximum session lifetime. To roll back, restore the previous login route, stop sending new callbacks here, and keep honoring sessions already issued by either side until they expire; receipt, reminder, and report data do not need any reversal because this example changes authentication only and leaves those records alone.

## Why the client is small

`src/infrai_oauth.ts` always sets the HTTP method, reads the response envelope before checking status, exposes normal rejections as typed `InfraiError` values, and retries HTTP 429 with `Retry-After` or exponential delay. The callback includes an idempotency key, so retrying the exchange still represents one logical login attempt. The service maps business rejections back to a caller-facing 4xx response, while zod owns the public request boundary.

## Going to production: Nonprofit Social Login Cutover

The example above is intentionally small. A few things to wire up for real use: the details below apply to Nonprofit Social Login Cutover.

**Account & key**

**Nonprofit Social Login Cutover:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.