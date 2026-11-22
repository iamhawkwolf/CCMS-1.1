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
| Notification outbox (WhatsApp, email, in-app) | `src/lib/notify.ts` |

## How the important parts work

**Tenancy.** The consultancy is the tenant. Staff queries start from `clientScope(ctx)` in `src/lib/auth/context.ts`: admins see every client in their consultancy, consultants only assigned clients. Client users are tied to one client and can reach only `/portal`. Any new page or action that touches client data should go through `getClientFor` or `clientScope`.

**Feature switches.** `src/lib/features/registry.ts` lists every feature, its minimum plan and any parent. `resolveFeature` applies: plan, parent, client override, account default, registry default. Turning a feature off never deletes data. Pages and jobs call `isFeatureOn(...)`. To add a feature, add it to the registry and gate the code with `isFeatureOn`.

**Compliance dates.** Rules are data in `src/lib/compliance/rules.ts`. They are seed values marked `verified: false`. **Have your CA confirm every due date, by state, before relying on them.** Generation is idempotent: each task has a unique `sourceKey`.

**Notifications.** Everything is queued in the `Notification` table and delivered by `deliverPending()`. The `console` provider just logs. Nothing calls `deliverPending()` on a schedule yet (see below).

## Not built yet (next steps)

- **Scheduler.** A cron or queue that calls `deliverPending()`, sends compliance alerts (7, 3 and 1 day before due), profile-review reminders (`needsReviewReminder` already exists and is tested), invoice reminders, and rolls the compliance calendar forward each month.
- **WhatsApp Business API.** Implement sending in `send()` in `src/lib/notify.ts`. Business-initiated messages need Meta-approved templates, so the template names in the code (`new_profile_submitted` and so on) need submitting.
- **Razorpay and UPI payment links** on invoices. `Invoice.paymentLinkUrl` is ready.
- **File uploads.** Resumes are currently links, and JDs are pasted text. Add storage (S3 compatible) and PDF watermarking.
- **Analytics and monthly branded report.** Data is there; no pages yet.
- **Time tracking timers and calendar sync.** Schema (`TimeEntry`) exists; no UI.
- **Staff invites by email, password reset, rate limiting on login.**
- **Data protection.** Candidate and employee data falls under India's DPDP Act: consent, retention and access logging need designing before real data goes in.
- Prisma 7 will drop the `package.json#prisma` seed config; move to `prisma.config.ts` when upgrading.

## Design

Dark glassmorphism with a Gen Z palette: electric violet, hot pink, cyan, mint and lime, with rose for danger. No orange. Tokens and components are in `src/app/globals.css`; light mode is available with `<html data-theme="light">`. Colour is never the only signal: every badge also carries a text label.
