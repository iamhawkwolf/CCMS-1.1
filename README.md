# CCMS: HR consultancy platform (V1)

One login for an Indian HR consultancy to run every client company: compliance calendar, requisition and profile tracker, JD protection, client portal and GST invoicing.

The product plan is in [`docs/features-and-workflows.md`](docs/features-and-workflows.md). This repo is the V1 scaffold of it.

## Stack

Next.js 16 (App Router, server actions), TypeScript, Prisma 6 with PostgreSQL, Tailwind 4 plus a hand-written glassmorphism design system in `src/app/globals.css`. Tests use Vitest.

## Run it

```bash
cp .env.example .env          # then set SESSION_SECRET (openssl rand -base64 32)
docker compose up -d          # Postgres on :5432
npm install
npm run db:migrate            # applies prisma/migrations
npm run db:seed               # demo data
npm run dev                   # http://localhost:3000
```

Demo logins (password `demo12345`, seed data only):

| Login | Role | Sees |
|---|---|---|
| `admin@demo.test` | Admin | All clients, settings, feature switches |
| `consultant@demo.test` | Consultant | Only clients assigned to them |
| `client@demo.test` | Client user | The client portal for Acme Textiles |

The demo JD share link is `/share/demo-share-link-token`.

Other commands: `npm test`, `npm run typecheck`, `npm run build`.

## What is in V1

| Area | Where |
|---|---|
| Multi-client dashboard, client profiles, team assignment | `src/app/app/`, `src/app/app/clients/` |
| Tasks and compliance calendar (PF, ESI, PT, TDS, LWF) | `src/lib/compliance/`, `src/lib/services/compliance.ts` |
| Requisition and profile tracker, stage rules, duplicate detection | `src/lib/requisition/`, `src/lib/services/requisition.ts` |
| JD masking, watermark, tracked view-only links | `src/lib/jd/mask.ts`, `src/app/share/` |
| Client portal | `src/app/portal/` |
| Two-level feature switches with change log | `src/lib/features/`, `src/app/app/settings/` |
| GST invoicing (CGST/SGST vs IGST, financial-year numbering) | `src/lib/billing/gst.ts`, `src/app/app/invoices/` |
| Notification outbox and delivery (WhatsApp, in-app) | `src/lib/notify.ts`, `src/lib/whatsapp/` |
| Scheduler: deadline alerts, review and invoice reminders, calendar roll-forward | `src/lib/jobs/`, `scripts/worker.ts`, `src/app/api/cron/` |
| In-app inbox | `src/app/app/inbox/` |

## How the important parts work

**Tenancy.** The consultancy is the tenant. Staff queries start from `clientScope(ctx)` in `src/lib/auth/context.ts`: admins see every client in their consultancy, consultants only assigned clients. Client users are tied to one client and can reach only `/portal`. Any new page or action that touches client data should go through `getClientFor` or `clientScope`.

**Feature switches.** `src/lib/features/registry.ts` lists every feature, its minimum plan and any parent. `resolveFeature` applies: plan, parent, client override, account default, registry default. Turning a feature off never deletes data. Pages and jobs call `isFeatureOn(...)`. To add a feature, add it to the registry and gate the code with `isFeatureOn`.

**Compliance dates.** Rules are data in `src/lib/compliance/rules.ts`. They are seed values marked `verified: false`. **Have your CA confirm every due date, by state, before relying on them.** Generation is idempotent: each task has a unique `sourceKey`.

## Scheduler and WhatsApp

### What runs, and when

| Job | Every | What it does |
|---|---|---|
| `calendar-rollover` | 6 h | Keeps each client's compliance calendar filled 3 months ahead (never duplicates). |
| `compliance-alerts` | 1 h | Alerts the task owner 7, 3, 1 and 0 days before a deadline, then every 3 days while overdue. Overdue items also go to the admins. Sent to the inbox, and to WhatsApp if the person saved a number. Stops after 60 days overdue. |
| `review-reminders` | 1 h | WhatsApps the client's primary contact when profiles have sat unreviewed past that client's reminder period (default 3 days). One message per requisition, not per profile. |
| `invoice-reminders` | 1 h | WhatsApps the client once in the last 3 days before the due date, then weekly while overdue. |
| `deliver` | 1 min | Sends everything queued. |

Everything uses India time (IST). WhatsApp messages only go out between 09:00 and 20:00 IST; anything queued outside that waits for the morning.

### Running it

Pick one:

```bash
npm run worker                 # a long-running process; keep exactly one running
```

or call the endpoint every minute from any scheduler (cron, a hosting platform's cron, GitHub Actions):

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron
```

For development, `npm run jobs:run -- --force` runs every job once now. Running extra copies is harmless: each job takes a database lease and has a minimum interval. Settings shows a green "Running" badge while the `deliver` job has finished within the last 10 minutes, and red "Not running" otherwise.

### How delivery behaves

- **Reliable.** A message is claimed by exactly one worker. Temporary failures (rate limits, Meta outages, network) retry after 1 min, 5 min, 15 min, 1 h, 3 h, then stop as FAILED. Permanent ones (bad number, unapproved template) fail at once. Failures are counted on the Settings page.
- **No repeats.** Each alert has a key (task, milestone, person), so hourly runs and catch-up after downtime never send the same reminder twice.
- **Respects switches.** The "WhatsApp reminders" switch is checked when queuing and again when sending, so turning it off stops messages already waiting.
- **STOP is honoured.** A reply of STOP, UNSUBSCRIBE or OPT OUT blocks that number and cancels anything waiting for it; START reverses it. The block list is shared across all consultancies on your WhatsApp number.
- **Delivery receipts.** Sent, delivered, read and failed updates from Meta are applied in order, even when they arrive out of order.

### Going live with WhatsApp

Until you do this, `WHATSAPP_PROVIDER=console` just prints messages instead of sending them.

1. In Meta Business Suite, set up a WhatsApp Business Account and add a sending number. Create a system user and a permanent access token.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and check `WHATSAPP_API_VERSION` against Meta's current supported version.
3. Run `npm run templates:print` and submit every template in WhatsApp Manager (category Utility, language English) with **exactly** the printed name and body. Approval can take from minutes to a couple of days. Messages using an unapproved template fail.
4. In the Meta app dashboard, set the webhook URL to `https://your-app/api/whatsapp/webhook`, the verify token to your `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`.
5. Set `WHATSAPP_PROVIDER=cloud`, then send yourself a test: add your own number as a client contact or in the inbox, and run `npm run jobs:run -- --force`.

If you change a template's wording or parameter order in `src/lib/whatsapp/templates.ts`, it must be re-approved in Meta.

### Tests

`npm test` runs fast unit tests. `npm run test:integration` runs the scheduler, delivery and webhook against a real Postgres (a separate `ccms_test` database, created automatically) and a local mock of Meta's API, so you can check retries, duplicate protection and signature handling without a WhatsApp account. **The Cloud API client has not been run against Meta's real servers**; the first real send is the real test.

## Not built yet (next steps)

- **Email.** There is no email provider yet; email notifications are only logged.
- **WhatsApp for employees and candidates** (document requests, interview confirmations) and **Kannada, Hindi and Tamil templates**. Only the five client and staff templates exist.
- **Razorpay and UPI payment links** on invoices. `Invoice.paymentLinkUrl` is ready.
- **File uploads.** Resumes are currently links, and JDs are pasted text. Add storage (S3 compatible) and PDF watermarking.
- **Analytics and monthly branded report.** Data is there; no pages yet.
- **Time tracking timers and calendar sync.** Schema (`TimeEntry`) exists; no UI.
- **Staff invites by email, password reset, rate limiting on login.**
- **Data protection.** Candidate and employee data falls under India's DPDP Act: consent, retention and access logging need designing before real data goes in.
- Prisma 7 will drop the `package.json#prisma` seed config; move to `prisma.config.ts` when upgrading.

## Design

A light, airy, frosted-glass look taken from a supplied design reference: a rounded app sheet on a cool-grey canvas, pill tabs across the top, soft translucent cards, light-weight type, thin KPI sparklines, and solid status pills.

**The palette is the reference's and nothing else**, sampled from the image: blue `#458eec`, green `#28b642`, red `#f75757`, cool-grey surfaces, near-black ink `#060b0b`. All tokens are in `src/app/globals.css`. Meaning is fixed: blue is brand and information, green is good or done, red is overdue or error, grey is everything else (including "pending"). There is no orange, and no other hue.

Two deliberate adjustments, both checked with a contrast and colour-blindness validator:

- The bright reference hues are only 2.4 to 3:1 against these surfaces, so small text and chart marks use darker shades of the **same three hues** (`--blue-ink`, `--green-ink`, `--red-ink`, and the `-mark` variants). Fills such as pills, chips and buttons use the exact reference colours, with dark ink text on them because white fails contrast.
- Green and red are almost indistinguishable to red-green colour-blind readers, so they are never the only signal: every green status has a ✓ and a label, every red one a ✕ and a label, and blue a dot. Chart colour is blue because green and red are reserved for good and bad.

There is a single light theme; the reference has no dark variant. Charts (`src/components/charts.tsx`) have hover tooltips, a "view as table" fallback, and a whole-number axis. `npm test` covers the data bucketing behind them.

To re-check that no stray colour crept in, a browser audit that reads every painted colour on every page lived in the scratch work for this change; the rule it enforced is simple: every colour must be a grey or a shade of blue, green or red.
