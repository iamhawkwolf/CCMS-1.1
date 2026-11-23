# Roadmap and decisions

Written 23 Nov 2026. Everything under "Planned" is **not built yet**. Prices and limits are from vendor pages checked in Nov 2026 and change often; re-check before relying on them.

For what exists today see [`README.md`](../README.md). For the original product plan see [`features-and-workflows.md`](features-and-workflows.md).

---

## 0. The plan (from the owner, 23 Nov 2026)

1. Build the entire product.
2. Have a **testing login** to demo to clients.
3. Test every feature in the app **now** (see [`test-checklist.md`](test-checklist.md)).
4. Move to a proper server later, **once there is a client**.

Choices made to fit that plan:

| Question | Choice for now | Revisit when |
|---|---|---|
| Hosting | Vercel + Neon free for testing. Before showing it to clients, upgrade Vercel to Pro or ask Vercel support: the free plan is for non-commercial personal use ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Or use a small server instead. | First client |
| What "don't share data" means | Files only stay in the client's storage | A client asks for nothing personal to be stored |
| Resume field extraction | Rules only, behind an interface so a self-hosted model can be added | Real resumes read badly, or volume justifies an AI server |
| Our own file storage | Cloudflare R2 (S3-compatible, so portable). It may ask for a payment card before creating a bucket (one third-party source; unconfirmed). | Moving to our own server (then local disk) |
| Resume masking default | Contact details hidden; "blind" mode as a per-client switch | A client wants stricter |

### Build order
1. **Demo-ready (done 23 Nov):** demo consultancy with an `isDemo` flag that blocks all real messages, one-click demo logins, a reset-to-fresh-data command and button, invite-only signup in production. Password reset and sign-in rate limiting are done; they need an email provider before they work in production.
2. **Resumes:** storage layer (our storage and client's own S3-compatible), upload, text reading, rule-based extraction, masking, review screen, blind profile sheet.
3. **Finish V1:** staff profiles screen, time-tracking timers, monthly branded report and analytics, Razorpay and UPI payment links, interview scheduling page.
4. **V2:** candidate database, onboarding and exit workflows, document vault (shares the storage layer), policy and handbook builder.
5. **V3:** contract staffing and per-head billing, deeper analytics. Payroll integrations (SaachiHRMS, INDPayroll, greytHR, Tally) depend on getting access to those vendors' APIs, which we cannot build without.

After each step there is something new to test and demo.

---

## 1. Decisions made

| Area | Decision |
|---|---|
| Stack | Next.js 16, TypeScript, Prisma 6, plain PostgreSQL. Nothing vendor-specific, so hosting and database can change (section 6). |
| Design | Light frosted glass from the supplied reference. Only its blue, green and red plus cool greys (README, "Design"). |
| WhatsApp | Meta WhatsApp Cloud API with pre-approved templates. `WHATSAPP_PROVIDER=console` until Meta is set up. |
| Scheduler | Lease-based job runner, run either as `npm run worker` or by calling `/api/cron` every minute. |
| Time | Everything scheduled in India time (IST); WhatsApp only 09:00 to 20:00. |

## 2. Open decisions (need an answer before building)

1. **Hosting for production.**
   - *One small server in Mumbai (Docker)*: fixed IP, no upload or time limits, the scheduler runs natively, an AI model can sit beside it later. You look after updates and backups. **Recommended** because the product promise is data privacy.
   - *Vercel + Neon (+ R2 for files)*: quickest to start and nearly free, but outbound connections come from changing addresses, so clients whose servers allow only known IPs cannot whitelist us. Fixed addresses need Vercel Pro or higher ([docs](https://vercel.com/docs/networking/static-ips.md)). Vercel's free plan is for personal use only.
2. **What "client does not want to share data" means.** Only the resume *files* stay in the client's storage (easier), or also the *extracted details* (name, experience, etc.), so nothing personal is stored in our database (much harder: everything fetched on demand).
3. **Field extraction method** (section 3).

## 3. Planned: resume handling

### Flow
1. Consultant uploads a PDF or Word resume (scanned pages included) or imports it from the client's storage.
2. The system reads the text (scans via OCR or an image-reading model) and finds name, phone, email, current company, experience, skills, education.
3. Fields pre-fill the "Submit a profile" form; the consultant reviews and corrects. The existing duplicate check runs on the phone and email found.
4. A masked version is produced for the client; the original never leaves the consultant side.

### Masking
- **Do not edit the original PDF.** Drawing boxes over a number usually leaves the number underneath, still selectable. Generate a fresh, consultant-branded profile sheet from the extracted data instead.
- Detect phone numbers, emails, links and addresses with **fixed rules** (reuse and extend `src/lib/jd/mask.ts`). Never rely on an AI for redaction.
- Contact details alone do not stop a client finding a candidate on LinkedIn by name and employer. Add a per-client switch for a stricter "blind" mode (initials instead of surname, employer names hidden), using the existing feature-switch system. Default: contact details hidden only.

### Extraction (pluggable)
Build the reader behind an interface so the method can change:
1. **Rules only (start here):** free, nothing leaves our servers, less accurate on names, companies and experience.
2. **Self-hosted open model** (for example Llama or Gemma through Ollama, called over an HTTP endpoint): data stays with us. Needs a larger server, and quality must be tested on real Indian resumes; no reliable speed or accuracy figures were found for small models on ordinary servers. Examples: a [published parser](https://huggingface.co/foduucom/resume-extractor), a [Gemma tutorial](https://dev.to/harishkotra/building-a-local-first-resume-analyzer-agent-with-gemma-3-and-langextract-2fk8).
3. **Hosted AI such as Claude (optional):** most accurate on messy and scanned resumes, small per-resume cost, but resume text goes to a third party, so it needs an API key and a line in the privacy policy.

The consultant's corrections on the review screen are labelled examples; keep them (with consent) to fine-tune an own model later.

### Storage
- One storage interface with two kinds of connection per client:
  - **Our storage** (Cloudflare R2: 10 GB free, then $0.015/GB-month, no download fees ([pricing](https://developers.cloudflare.com/r2/pricing)); or the server's own disk if we host ourselves).
  - **Client's own storage**: any S3-compatible bucket first (AWS S3, MinIO and similar), SFTP later. We pull resumes from a folder and can write processed files back.
- Client access keys stored **encrypted** with an `ENCRYPTION_KEY` held outside the database. Losing the key means those keys cannot be read.
- **Rule enforced in code:** a client using their own storage is never sent to a third-party AI.
- Store file **keys**, never full URLs, so moving buckets is a copy plus one setting.
- Files private; opened only through short-lived signed links. Browser uploads go straight to storage (serverless functions cap request size at roughly 4.5 MB). Cap files around 5 MB; accept PDF and Word only, checked by file signature.
- Personal data: India's DPDP Act. Needs a retention period, deletion of a candidate's files on request, and access logging.

## 4. Planned: production checklist

- [x] **Demo account isolation.** Done: the demo consultancy is flagged `isDemo` and delivery never contacts anyone for it (tested).
- [x] **Demo setup only touches the demo consultancy.** `npm run db:seed` is now the same as `npm run demo:reset`, and it never deletes anyone else's data. On a hosted copy set `DEMO_PASSWORD` or leave it unset (random).
- [x] **Close open signup.** Signup is off in production unless `ALLOW_SIGNUP=1`. Still to build: a way for an admin to invite staff and client users by email, and a first real admin account (for now, set `ALLOW_SIGNUP=1` briefly).
- [x] Password reset and login rate limiting (built; password-reset emails are not sent in production until an email provider is wired into `src/lib/email.ts`).
- [ ] An email provider (email is only logged today).
- [ ] Automated database backups, and a tested restore.
- [ ] Your own domain from day one (for example `app.yourcompany.in`), so moving servers is a DNS change.
- [ ] Submit all WhatsApp templates to Meta (`npm run templates:print`) and set the webhook to `/api/whatsapp/webhook`.
- [ ] Privacy policy and terms; DPDP consent, retention and deletion design.
- [ ] Choose the final server before onboarding clients who whitelist our IP for their storage.

## 5. Deploying the demo (Vercel + Neon), no clients yet

For you and for demos to prospects. No real data, no real messages. Not yet tried on Vercel itself, so expect to fix a small thing or two on the first go.

**Before you show it to a prospect:** Vercel's free (Hobby) plan is for non-commercial personal use ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). Looking at it yourself is fine; for client demos upgrade to Pro or use a small server.

1. **Neon** (neon.com, free): create a project, choose the region nearest India that is offered. Open *Connect* and copy two strings: the **pooled** one (host contains `-pooler`) and the **direct** one.
2. **Create the tables and the demo data**, once, from your computer (needs Node 20+; clone the repo, `npm install`):
   ```bash
   DATABASE_URL="<direct string>" npm run db:deploy
   DATABASE_URL="<direct string>" npm run demo:reset
   ```
   `db:deploy` creates the tables. `demo:reset` fills the demo consultancy. Re-run `db:deploy` whenever a new version adds a migration.
3. **Vercel** (vercel.com): *Add New, Project*, import the GitHub repo, set the **Production Branch** to `claude/optimistic-babbage-kaixzv` (or the branch you merge to). Leave the build settings alone (`npm run build` already runs `prisma generate`). Add these environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the **pooled** string with `&pgbouncer=true` added at the end |
   | `SESSION_SECRET` | output of `openssl rand -base64 32` |
   | `APP_URL` | your site's address, e.g. `https://ccms-demo.vercel.app` (set it after the first deploy, then redeploy) |
   | `DEMO_MODE` | `1` |
   | `DEMO_PASSWORD` | optional; skip it and the typed-password login is unguessable, the buttons still work |

   Do **not** set `ALLOW_SIGNUP`, `WHATSAPP_PROVIDER` or `CRON_SECRET`. Signup stays closed, nothing is sent, and no scheduler is needed (the demo reset runs the reminder jobs once, so the inbox already has alerts).
4. Deploy, open the address, and click **Explore as Admin**. That is your **testing login** for demos: share the address and tell people to click an "Explore as" button. Use **Reset demo data** (top banner) before each demo.
5. **Check it:** walk through `docs/test-checklist.md` against the hosted copy.

Neon free plan (checked Nov 2026): 1 GB storage and 100 compute-hours per project per month ([source](https://neon.com/faqs/free-plan-limits-and-quotas)). The first click after a quiet spell is slower while the database wakes. For a demo this is fine.

If the first click fails with a timeout, run `DATABASE_URL="<direct string>" npm run demo:reset` again from your computer.

**Later, with a client:** follow section 4 and move to a proper server (section 6). Nothing in the app is tied to Vercel or Neon.

Alternatives: Supabase (free database 500 MB, pauses after a week idle; Pro $25 a month includes 100 GB of file storage) ([pricing](https://supabase.com/pricing)); Vercel Blob (about 1 GB free) ([pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)).

## 6. Moving server or database later

Both are straightforward because the app uses plain Postgres and environment variables only. A full move has **not** been rehearsed; test the restore on a spare database first.

```bash
pg_dump --format=custom --no-owner "<old direct connection string>" > backup.dump
pg_restore --no-owner --dbname "<new direct connection string>" backup.dump
```

1. Stop the scheduler and show a maintenance notice.
2. Dump, restore into the new database (same or newer Postgres version), then run `npm run db:deploy` to confirm the schema is current.
3. Copy the environment variables to the new host, change `DATABASE_URL`, deploy, and check.
4. Point the domain at the new host. Update the WhatsApp webhook URL in Meta and the cron timer.
5. Keep `ENCRYPTION_KEY` unchanged. Users will have to sign in again.
6. Clients who whitelisted our server IP must whitelist the new one.
7. Keep the old database for a week, then delete it.

Still to add for easy moves: a `Dockerfile` and a backup script.
