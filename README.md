# PinPilot AI — Pinterest Automation MVP

A private, free-first Next.js starter. It includes an OAuth connection flow, encrypted token storage in Supabase, board listing, draft Pin copy, and a manual publish action using Pinterest API v5. It is intentionally honest about what is not built yet: live trend discovery, competitor metrics, image generation/hosting, queue scheduler, and account analytics are later phases.

## Before you start

- Node.js 20.9+ and npm
- A Pinterest business account and a Pinterest developer app approved for the API access you need
- A free Supabase project
- A publicly accessible HTTPS image URL to test publishing

Pinterest API access can require app approval. OAuth scopes used here are `boards:read`, `pins:read`, `pins:write`, and `user_accounts:read`. If your app is not approved for a scope, the endpoint will fail; do not work around access controls.

## Run locally

1. Extract the zip and open this folder in VS Code.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Create a Supabase project and run `supabase-schema.sql` in its SQL Editor.
5. In Supabase project settings, copy the project URL and service-role key into `.env.local`. The service-role key is server-only; never prefix it with `NEXT_PUBLIC_`.
6. Generate an encryption key with `openssl rand -hex 32` and place it in `TOKEN_ENCRYPTION_KEY`.
7. In Pinterest Developers, create/configure an app and add this exact redirect URI: `http://localhost:3000/api/pinterest/callback`. Set the app ID and secret in `.env.local`.
8. Run `npm run dev`, open `http://localhost:3000`, then choose **Connect Pinterest securely**.
9. Approve requested scopes, load boards, generate draft ideas, and test with an image URL you own.

## Security notes

- Never paste your Pinterest password, client secret, or access token into chat or frontend code.
- Tokens are encrypted using AES-256-GCM before being stored in Supabase.
- OAuth state is checked to mitigate CSRF.
- This first MVP has no user login. Do not deploy it publicly until you add app authentication and restrict the dashboard/API to your own user.
- Configure HTTPS in production. Keep all credentials in host environment variables.
- The current callback upserts one token record, appropriate only for a private single-account deployment.

## Deploy

A simple option is Vercel for the Next.js app and Supabase for persistent storage. Import this folder into a private GitHub repository, connect it to Vercel, set every variable from `.env.example` in Vercel Project Settings, change `APP_URL` and `PINTEREST_REDIRECT_URI` to your deployed HTTPS domain, and register the same redirect URI in Pinterest Developers. Redeploy after setting variables. Do not make the app public until authentication is added.

## Current feature status

- [x] Niche configuration UI
- [x] Pinterest OAuth state validation
- [x] Encrypted server-side token persistence and refresh attempt
- [x] List accessible boards
- [x] Draft SEO-style Pin concepts (template-based, not live trend research)
- [x] Publish an image Pin from a public HTTPS image URL
- [ ] Live trend/search API integration (depends on approved API endpoints/scopes)
- [ ] Competitor discovery and public-signal analysis
- [ ] Original image generation and hosted media storage
- [ ] Durable schedule queue and background cron worker
- [ ] Pin/account analytics dashboard
- [ ] Production authentication, rate limiting, audit logs, tests, and monitoring

## Recommended next milestone

After local OAuth and a test Pin work, add the scheduled queue and a protected cron endpoint. Then connect an image-generation provider and Supabase Storage. Trend and competitor research should use approved Pinterest endpoints and/or clearly attributed public data, not scraping behind login or fabricated metrics.

## Queue and scheduled publishing endpoint

This starter also includes `POST /api/queue` to schedule a Pin and `GET /api/cron/publish` to process due items (up to five per run). The cron route requires `Authorization: Bearer <CRON_SECRET>`. `vercel.json` requests a 15-minute cron interval; actual cron frequency depends on your Vercel plan and current platform limits. Vercel injects `CRON_SECRET` only if configured; verify your platform's cron authorization setup before production. Add authentication to all dashboard and queue routes before deploying publicly. Queue API body example:

```json
{
  "boardId": "YOUR_BOARD_ID",
  "title": "An original Pin title",
  "description": "Helpful description with relevant terms.",
  "imageUrl": "https://public-host.example/pin.jpg",
  "destinationUrl": "https://your-shop.example/product",
  "scheduledAt": "2026-10-13T18:00:00.000Z"
}
```

The current UI publishes immediately; scheduling is available through the queue API, and a queue management UI is a follow-on task. Do not rely on a cron schedule until it has been verified in your chosen hosting plan.
