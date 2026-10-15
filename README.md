# PinPilot AI — Full Automation Upgrade

PinPilot AI is a private Next.js workspace for building a Pinterest content pipeline around a niche and a destination URL. While Pinterest developer approval is pending, Buffer is the publishing connector. The Phase 2 work is grouped in this single feature branch and is **not merged into `main` or approved for production publishing yet**.

## Phase 2 — one consolidated upgrade

- **Public website intelligence:** safely reads available HTML metadata, canonical URL, title, description, headings, visible text, Product/Article JSON-LD, price and public image URLs. It classifies pages as marketplace listings, ecommerce products, blogs/content, pages with recognizable AdSense markers, or general websites. It does not bypass login, paywalls or site access restrictions.
- **Product-specific Pins:** when a safe, supported public source image is available, Sharp composes it into the original 2:3 Pin layout and saves the final image to Supabase Storage. If extraction or image processing fails, the original branded template renderer is the fallback; the app does not pretend a template is a photorealistic AI image.
- **Structured AI copy:** an optional OpenAI Responses API integration generates a fixed count of Pinterest titles, descriptions, keywords and visual briefs. The key stays server-side. If no key is configured, fails, or times out, safe deterministic copy is used. OpenAI usage may incur charges.
- **Grounded research:** public Google Trends RSS is tried as a no-key broad daily-trend source. Pinterest Trends, suggested keywords and public Pin discovery are also attempted through Pinterest API access. Each source reports whether it worked; no search volume, keyword difficulty, sales, private competitor metrics or unsupported trends are fabricated.
- **Calendar and timezone:** posting slots are calculated in the configured IANA timezone, defaulting to `America/Los_Angeles`, and the dashboard formats queue timestamps in that same timezone. DST handling uses the runtime's IANA timezone database.
- **Buffer publishing:** `test` makes no post submissions; `draft` sends due Pins to Buffer Drafts; `queue` sends queued Pins to Buffer with an explicit future `dueAt`. Buffer then controls the scheduled delivery even when the browser is closed.
- **Quality and reliability:** validates required text/URLs before submission, records quality checks, uses an idempotency key and conditional queue claim, bounds external fetches, retries definitive failures with a limit, and uses `review_required` when a timeout means post creation might have succeeded but needs verification.
- **Status and performance:** scheduled Buffer posts are reconciled against Buffer's returned status. Real post metrics are saved only when the provider returns them, and measured high-performing keywords can inform future Pin ideas. Buffer's network metrics may arrive with a delay; unavailable values remain blank.
- **Official Pinterest analytics:** the existing OAuth/analytics integration remains dependent on Pinterest approval and granted scopes. Buffer publishing does not imply that official Pinterest API access is approved.

## Important behavior

- **Pause does not cancel posts already scheduled inside Buffer.** It stops PinPilot from creating/submitting additional posts. Cancel already-scheduled Buffer posts directly in Buffer if they must not publish.
- Etsy and other websites can block server-side page reads or require JavaScript for content. In those cases the agent records an extraction warning and falls back to basic template copy.
- The public RSS feed gives broad daily trends; it is not a niche-specific keyword-volume or difficulty database. Competitor Pin discovery depends on accessible Pinterest API endpoints.
- A Buffer draft is not a published Pin. Keep `BUFFER_MODE=draft` until a controlled scheduled-post test is deliberately approved.
- The feature branch requires a database migration before use on the existing Supabase project. Do not merge or enable scheduled publishing until the migration is run, code is reviewed, and the one-post test is verified.

## Stack

- **Next.js App Router + Netlify:** dashboard, server routes and a scheduled worker that calls the cron endpoint every 15 minutes on published deployments.
- **Supabase:** private settings/queue/run logs, encrypted official Pinterest tokens, extracted site snapshots, performance records and public HTTPS Pin assets.
- **Buffer GraphQL API:** temporary publish/schedule connector.
- **Optional OpenAI Responses API:** structured AI text generation.
- **Pinterest Developer API:** OAuth, board access, Pin endpoints, trends and account analytics only when access/scopes allow.

## Install / run locally

Node.js 20.9+ is recommended.

```bash
npm install
npm run dev
```

The dashboard opens in Demo Mode. Demo actions create a local sample and do not publish.

## Supabase setup

1. For a fresh project, run `supabase-schema.sql` in Supabase SQL Editor.
2. For the existing MVP project, back up the database and run `supabase-phase-2-migration.sql` before deploying this branch. The migration is additive and retains existing queue records.
3. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-side Netlify environment variables. Never use the service-role key in browser code or share it in chat.
4. The worker creates the public `pinpilot-assets` Storage bucket when it needs to store Pin images.

## Netlify environment variables

Required for the private live dashboard and server storage:

- `DASHBOARD_PASSWORD`: strong private dashboard password.
- `DASHBOARD_SESSION_SECRET`: random secret at least 32 characters long.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOKEN_ENCRYPTION_KEY`: exactly 64 hex characters (32 bytes).
- `CRON_SECRET`: long random secret for the scheduled worker endpoint.
- `APP_URL=https://YOUR-SITE.netlify.app`

Temporary Buffer publishing connector:

- `BUFFER_API_KEY`: keep server-side; do not paste it into chat or commit it.
- `BUFFER_MODE=test` to verify connection without submitting posts; `draft` to send due posts to Drafts; `queue` to schedule due/future posts in Buffer.
- Optional account selectors: `BUFFER_ORGANIZATION_ID`, `BUFFER_CHANNEL_ID`, `BUFFER_BOARD_SERVICE_ID`.

Optional AI copy provider:

- `OPENAI_API_KEY`: optional secret; requests may incur API usage charges.
- `OPENAI_MODEL=gpt-4o-mini`: model name can be changed to one supported by the account.

Optional official Pinterest OAuth/analytics:

- `PINTEREST_CLIENT_ID`
- `PINTEREST_CLIENT_SECRET`
- `PINTEREST_REDIRECT_URI=https://YOUR-SITE.netlify.app/api/pinterest/callback`
- `PINTEREST_ANALYTICS_ENABLED=true` only when the approved API access and analytics scopes are available.

Only server-side variables should hold secrets. Never add a `NEXT_PUBLIC_` prefix to API keys, service-role keys, encryption keys, or passwords.

## Safe rollout checklist

- [ ] Review changes on `phase-2-full-automation-upgrade`.
- [ ] Run the Phase 2 additive Supabase migration on the existing project.
- [ ] Verify the feature-branch build/type checks before merging.
- [ ] Keep live mode paused while checking destination analysis and generated creative quality.
- [ ] Confirm production `BUFFER_MODE=draft` for the first controlled test.
- [ ] Only after approval, configure `BUFFER_MODE=queue` and test one scheduled Pin. Confirm both Buffer's `sent` status and Pinterest visibility.
- [ ] Confirm real Buffer metrics, if the channel exposes them, before enabling performance-driven optimization at scale.

No step in this checklist should require sharing secrets in chat.
