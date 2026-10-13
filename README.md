# PinPilot AI — one-click Pinterest automation MVP

A private, free-first Next.js project branded with the supplied PinPilot AI logo. It is designed so the owner configures a niche, audience, destination URL, daily Pin limit and timezone once, connects Pinterest through OAuth, then uses **Start Automation**. In live mode the server can prepare daily Pin batches, create original template-rendered PNGs, queue them and publish due posts through Pinterest API access. The scheduled worker runs on Netlify independently of the browser.

## What works in this source

- Branded, responsive dashboard with the supplied logo (`public/logo-mark.png` and `public/logo-full.png`).
- One-click demo batch: creates a configured batch, previews vertical creative templates, SEO copy and local queue entries without requiring per-Pin clicks.
- Live-only dashboard password cookie with server-side HMAC signing; live API routes require it.
- Pinterest OAuth authorization with CSRF state cookie and encrypted access/refresh-token storage in Supabase.
- Automatic selection of the first accessible Pinterest board so the owner does not need to choose a board for every Pin.
- Background automation settings persisted in Supabase; a Netlify Scheduled Function calls the protected automation worker every 15 minutes on published deploys.
- Daily original template-rendered PNG generation (1000×1500), upload to a public Supabase Storage bucket, scheduled queue insertion and due-Pin publishing through the official API.
- Retry handling and a conditional database claim for scheduled posts to reduce duplicate publishing risk.
- Research attempts through Pinterest trend, suggested-term and Pin search endpoints. The dashboard/run logs must reflect actual API access; endpoints can be denied or unavailable for a given app tier, and unavailable sources are not fabricated.
- Analytics route for account metrics and accessible Pins. Some metrics can be unavailable based on permissions or API responses; a dash is not treated as zero.
- Privacy policy page at `/privacy`.

## Important limitations

- The app is **not yet ready to run live immediately**: Pinterest developer approval, supported write/read permissions, Supabase project setup, hosting environment variables, SQL migration and an authenticated OAuth connection are all required.
- The free-first creative generator renders original typographic/template-based vertical graphics. It is not a general-purpose AI image model and does not create photographic/mockup imagery. A separate AI image/text provider can be added later if needed.
- Pinterest Trends and suggested terms are permission-limited. The public Pin search route is attempted and treated as unavailable if Pinterest refuses or does not expose it to the app. The app does not scrape behind login or invent competitor metrics.
- The current trend match is a basic token match, not a proprietary keyword difficulty or sales-estimate metric.
- Pinterest publishing is asynchronous and cannot be guaranteed if the API rejects a Pin, image URL, board, scope or rate limit. Failed posts are logged and retried up to three attempts.
- Netlify Scheduled Functions only run on published deployments, according to Netlify's schedule behavior. They are not executed on deploy previews. The function runs every 15 minutes and processes due queue jobs in small batches.
- The dashboard is for one owner. The admin password is a separate security layer; do not remove it. Privacy Policy needs a genuine owner contact method before final app review.

## Free-first architecture

- **Netlify**: website, App Router API routes and scheduled worker.
- **Supabase Free**: encrypted Pinterest tokens, automation settings, persistent queue, run logs, research snapshots and public PNG assets.
- **GitHub**: source control and deployment trigger.
- **Pinterest Developer API**: secure OAuth, boards, Pins, available trends and analytics. Access depends on approval and scopes.
- **No mandatory paid AI API**: initial artwork is rendered locally on the server from templates. External AI services are optional future improvements.

## Install / run in browser IDEs

Use the project in Replit or another Node.js online IDE. Node.js 20.9+ is recommended.

```bash
npm install
npm run dev
```

Open the preview URL. It starts in Demo Mode; demo actions are local and do not publish to Pinterest.

## Supabase setup

1. Create a Supabase project on its free plan.
2. Open SQL Editor and run `supabase-schema.sql` in full. The SQL creates tables for encrypted tokens, settings, queue, run history, analytics snapshots and research snapshots. It also migrates the queue's status constraint for existing MVP installs.
3. Copy the Supabase project URL and **service-role key** into Netlify environment variables. Never prefix the service-role key with `NEXT_PUBLIC_` and never paste it into chat.
4. The app creates a public `pinpilot-assets` Storage bucket when live automation first generates images. Generated Pin images need public HTTPS URLs so Pinterest can fetch them.

## Pinterest setup

1. Wait for the Pinterest app's Trial access review to complete. Keep using Demo Mode while access is pending.
2. Configure these server-only Netlify variables:
   - `PINTEREST_CLIENT_ID`
   - `PINTEREST_CLIENT_SECRET`
   - `PINTEREST_REDIRECT_URI=https://YOUR-SITE.netlify.app/api/pinterest/callback`
3. Register that exact HTTPS redirect URI in the Pinterest developer app's Configure tab.
4. OAuth uses `boards:read`, `pins:read`, `pins:write`, `user_accounts:read`. The app may only use scopes permitted by Pinterest's current approval. Trend/suggested-term endpoints may separately be unavailable even when Pin publishing works.

## Security variables

Add these in Netlify **Site configuration → Environment variables** before connecting the live account:

- `DASHBOARD_PASSWORD`: a strong, unique password to unlock the private live dashboard.
- `DASHBOARD_SESSION_SECRET`: random secret of at least 32 characters used to sign an HTTP-only session cookie.
- `TOKEN_ENCRYPTION_KEY`: exactly 64 hex characters (32 bytes), used for AES-256-GCM encryption of OAuth tokens.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`: long random secret protecting the scheduled worker endpoint.
- `APP_URL=https://YOUR-SITE.netlify.app`

Also add `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` and `PINTEREST_REDIRECT_URI` above. Never expose any of these as a browser/public variable. Redeploy after setting environment variables.

Generate secrets in a secure password manager or using a trusted random generator. In a local shell, `openssl rand -hex 32` creates a 64-character hex encryption key. Do not share generated secrets in chat or screenshots.

## Netlify scheduled automation

`netlify/functions/automation-tick.mts` runs every 15 minutes on published deploys. It calls `/api/cron/automation` with `Authorization: Bearer $CRON_SECRET`. Configure `APP_URL` and `CRON_SECRET` in the Netlify runtime environment. After deployment, check the site's Functions view/logs to confirm the scheduled function is registered and running. When automation is paused, the worker does not create or publish posts. The queue is durable in Supabase, not browser local storage.

## Deployment checklist

1. Upload/commit the whole project folder to the GitHub repository connected to Netlify. Keep the `app`, `lib`, `public`, `netlify`, `supabase-schema.sql`, `package.json`, `netlify.toml`, and config files.
2. Confirm Netlify's build command is `npm run build` and the site's base directory points at the folder containing `package.json`.
3. Add the environment variables listed above, then deploy.
4. Confirm `https://YOUR-SITE.netlify.app/` and `/privacy` load.
5. Register the exact deployed OAuth callback in Pinterest Developers.
6. Unlock the private dashboard, connect Pinterest, and start automation. The app auto-selects the first accessible board.
7. Check Netlify Function logs and the Supabase `automation_runs` and `pin_queue` tables.
8. Test first with low daily limits and verify the actual Pins/links in Pinterest before allowing the routine to continue.

## Troubleshooting

- `Pinterest access pending`: remain in Demo Mode; live publishing cannot be unlocked by another provider or by code changes alone without an authorized publishing route.
- `DASHBOARD_PASSWORD`/session issue: set both `DASHBOARD_PASSWORD` and `DASHBOARD_SESSION_SECRET` (minimum 32 characters), then redeploy.
- Supabase `relation does not exist`: run the complete SQL schema. For errors about RLS, keep the service-role key server-only; do not create public table policies for this private app.
- Storage bucket error: check Supabase Storage is enabled and the service-role key is current.
- `403`, `401`, or scope errors from Pinterest: check app approval, the granted API scopes and that the exact redirect URI matches. Do not try to bypass Pinterest access restrictions.
- `Scheduled function` not running: Netlify scheduled functions run on published deploys only; verify the Functions dashboard and `APP_URL`/`CRON_SECRET` variables.
