# Session context (compact handoff, 23 Nov 2026)

Not committed. Built from the repo, branch diffs and the newest ~100 events of each earlier session (older events not read).

## Product
**Banyanroot** (was CCMS): multi-client HR consultancy platform for India. Next.js 16 App Router + server actions, TypeScript, Prisma 6, Postgres, Tailwind 4 (glass UI, palette: blue #458eec / green #28b642 / red #f75757 only), Vitest. Tenant = consultancy; use `clientScope(ctx)` / `getClientFor` for every client-data query. Features gated by `isFeatureOn` (`src/lib/features/registry.ts`). Scheduler in `src/lib/jobs`, WhatsApp via Meta Cloud API (`WHATSAPP_PROVIDER=console` until live). All times IST, WhatsApp only 09:00-20:00.

## Owner's plan
1. Build the whole product. 2. A testing/demo login for clients. 3. Test every feature now (`docs/test-checklist.md`). 4. Move to a proper server once there is a client.
Choices: Vercel + Neon free for testing (Vercel free is non-commercial: Pro or a small Mumbai server before client demos); files-only for "don't share data"; resume extraction by rules behind an interface (optional AI); Cloudflare R2 storage; masking default = contact details hidden, per-client "blind" switch. Masking is rules-based on freshly generated sheets, never AI, never edit the original PDF.

Build order: (1) demo-ready (isDemo flag, reset, invite-only signup, password reset) (2) resumes (storage, upload, extraction, masking, review, blind sheet) (3) finish V1 (staff profiles, timers, monthly report/analytics, Razorpay/UPI links, interview scheduling) (4) V2 (candidate DB, onboarding/exit, document vault, policy builder) (5) V3 (contract staffing, deeper analytics, payroll integrations if API access).

## Repos and branches
- Owner moved from `thebinarywolf` to **`iamhawkwolf/CCMS-1.1`**. This session has both attached; develop on `claude/wonderful-darwin-9aly6a` (currently == `sweet-wozniak` == `af3093d`, clean, not yet on remote).
- Default branch on GitHub is `claude/sweet-wozniak-ui5oou`; there is **no `main`**. Plan: create `main`, one PR per build step. PR #1 (rename+logo) is already merged here.
- Branches NOT in HEAD (all work is split, nothing merged together):
  - `claude/focused-curie-yaorpw` (4 commits): resume reader (PDF/Word text, rules + optional LLM extraction, `/api/resumes/parse`), JD-to-resume match % (`src/lib/resume/*`, `/api/resumes/match`), upload+ranking screen `requisitions/[id]/match`, saved match score on profiles (signed token, migration `profile_match_score`, client portal never shows score), fractional experience fix. 119 tests pass there. Next idea: Tesseract OCR fallback for scans (asked owner: are scans common? unanswered). Branched from before the Banyanroot rename, so it still says CCMS and will conflict on README/package names.
  - `claude/optimistic-babbage-kaixzv` (1 commit): demo account (isDemo flag migration `demo_flag`, one-click demo logins, rich seed in `src/lib/demo/seed.ts`, safe reset `scripts/demo-reset.ts`, demo banner, `notify.ts` blocks real sends for demo, `tests/integration/demo.test.ts`). Removes old `prisma/seed.ts` content.
  - `claude/beautiful-mendel-243o0i` (2 commits): `find-skills` agent skill + `@playwright/test ^1.63.0` dev dependency. No `playwright.config.ts` or tests yet. Chromium preinstalled in cloud at `/opt/pw-browsers`.
  - `claude/dreamy-bohr-9s6j8b`: rename/logo, already in HEAD.

## Open items / next steps
1. **Merge the branches into one line** (suggest: create `main` from HEAD; merge optimistic-babbage, focused-curie, beautiful-mendel; resolve CCMS->Banyanroot naming in resume files, README, `.env.example`; run `npm run typecheck && npm test`, then `npm run test:integration`). Check migration order (`demo_flag` 20261123130000 vs `profile_match_score` 20261123130256).
2. Remaining demo-ready items: invite-only signup, password reset + login rate limiting, never run seed on prod.
3. Resume step: storage interface (R2 / client S3), upload, masking + blind profile sheet, review screen, OCR if needed. See `docs/roadmap-and-decisions.md` sections 3-4.
4. Then V1 leftovers (timers, report, Razorpay, interview scheduling), Dockerfile + backup script.
5. Playwright config and first e2e test.
6. Pending questions to the owner: scanned resumes common? start new session vs rename repo (answer: this session already has the new repo attached). Integration tests and a Vercel deploy have never been run.

## Known gotchas
- Local DB must be reset after rename (`docker compose down -v`, `up -d`, `db:migrate`, `db:seed`); cookie is `banyanroot_session`; WhatsApp templates `banyanroot_*` (re-submit to Meta; Cloud API client never run against real Meta).
- Compliance due dates are seed data, `verified: false`; a CA must confirm.
- 7 npm audit vulnerabilities (2 critical) unchecked.
- Demo password `demo12345` is public: delete demo deploys after use.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line; do not open PRs unless asked.
