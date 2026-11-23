# Session context (compact handoff, 23 Nov 2026)

Not committed. Built from the repo, branch diffs and the newest ~100 events of each earlier session (older events not read).

## Product
**Banyanroot** (was CCMS): multi-client HR consultancy platform for India. Next.js 16 App Router + server actions, TypeScript, Prisma 6, Postgres, Tailwind 4 (glass UI, palette: blue #458eec / green #28b642 / red #f75757 only), Vitest. Tenant = consultancy; use `clientScope(ctx)` / `getClientFor` for every client-data query. Features gated by `isFeatureOn` (`src/lib/features/registry.ts`). Scheduler in `src/lib/jobs`, WhatsApp via Meta Cloud API (`WHATSAPP_PROVIDER=console` until live). All times IST, WhatsApp only 09:00-20:00.

## Owner's plan
1. Build the whole product. 2. A testing/demo login for clients. 3. Test every feature now (`docs/test-checklist.md`). 4. Move to a proper server once there is a client.
Choices: Vercel + Neon free for testing (Vercel free is non-commercial: Pro or a small Mumbai server before client demos); files-only for "don't share data"; resume extraction by rules behind an interface (optional AI); Cloudflare R2 storage; masking default = contact details hidden, per-client "blind" switch. Masking is rules-based on freshly generated sheets, never AI, never edit the original PDF.

Build order: (1) demo-ready (isDemo flag, reset, invite-only signup, password reset) (2) resumes (storage, upload, extraction, masking, review, blind sheet) (3) finish V1 (staff profiles, timers, monthly report/analytics, Razorpay/UPI links, interview scheduling) (4) V2 (candidate DB, onboarding/exit, document vault, policy builder) (5) V3 (contract staffing, deeper analytics, payroll integrations if API access).

## Repos and branches (updated after merge)
- Owner moved from `thebinarywolf` to **`iamhawkwolf/CCMS-1.1`** (Claude GitHub App installed there). Develop on `claude/wonderful-darwin-9aly6a`.
- **`main` now exists** and contains everything: rename/logo + demo account (`optimistic-babbage`) + Playwright dep and find-skills (`beautiful-mendel`) + resume reader, match score and saved scores (`focused-curie`). Conflicts were only imports in `login`/`signup` pages (resolved, signup closed-state now uses `Wordmark`). On main: typecheck clean, 119 unit tests and 42 integration tests pass (local Postgres 16, `pg_ctlcluster 16 main start`; role/db `banyanroot`).
- Old feature branches are now merged and can be deleted on GitHub. GitHub's default branch is still `claude/sweet-wozniak-ui5oou`; set it to `main` in repo Settings > Branches. One PR per build step from here.

## Open items / next steps
1. Demo-ready leftovers: password reset, login rate limiting, invite-only signup (demo branch has `signupOpen()` switch), never seed prod.
2. Resume step: storage interface (R2 / client S3), upload, masking + blind sheet, review screen, OCR fallback if scans are common (unanswered).
3. V1 leftovers (timers, monthly report, Razorpay/UPI, interview scheduling), Dockerfile + backup script.
4. Playwright config + first e2e test (dep installed, no config yet).
5. Roadmap doc still says `ccms-demo.vercel.app` once; Vercel deploy and real Meta WhatsApp send never tested.

## Known gotchas
- Local DB must be reset after rename (`docker compose down -v`, `up -d`, `db:migrate`, `db:seed`); cookie is `banyanroot_session`; WhatsApp templates `banyanroot_*` (re-submit to Meta; Cloud API client never run against real Meta).
- Compliance due dates are seed data, `verified: false`; a CA must confirm.
- 7 npm audit vulnerabilities (2 critical) unchecked.
- Demo password `demo12345` is public: delete demo deploys after use.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line; do not open PRs unless asked.
