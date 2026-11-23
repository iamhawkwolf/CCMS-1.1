# Feature test checklist

Walk through each feature and tick it off. Each step says what to do and what you should see. If something does not match, note the step number and tell me.

**Demo logins.** On the sign-in page, click **Explore as Admin / Consultant / Client** (no password). Or type the email with password `demo12345` (local only; a hosted copy uses `DEMO_PASSWORD`). Run `npm run demo:reset` or use "Reset demo data" in the top banner to start fresh:

| Login | Role | Should see |
|---|---|---|
| `admin@demo.test` | Admin | Everything, including Settings |
| `consultant@demo.test` | Consultant | Only Acme Textiles (the one client assigned) |
| `client@demo.test` | Client user | Only the client portal for Acme Textiles |

**Reminder jobs.** Alerts and reminders appear only after the scheduler has run. On your computer run `npm run jobs:run -- --force`. On a hosted copy, something has to call `/api/cron` (see `roadmap-and-decisions.md`). WhatsApp messages are printed, not sent, until Meta is set up.

**Not testable yet:** real WhatsApp or email sending, Razorpay or UPI payment links, resume upload, analytics monthly report, time-tracking timers.

---

## 1. Sign in and roles
- [ ] Wrong password shows "Email or password is incorrect" and keeps your email in the box.
- [ ] Admin login lands on the Dashboard; the top bar has a Settings icon.
- [ ] Consultant login has no Settings icon; opening `/app/settings` sends you back to the Dashboard.
- [ ] Client login lands on the portal and cannot open `/app/clients` (sent back to the portal).
- [ ] Sign up with a new email creates a new consultancy with no clients (local only). On a hosted copy `/signup` says "By invitation only".
- [ ] The sign-in page shows the three "Explore as" buttons and each lands in the right place. Every page of the demo shows the blue "Demo account" banner; only the admin sees "Reset demo data".
- [ ] After "Reset demo data" you stay signed in as admin and the dashboard shows fresh data.

## 2. Dashboard (admin)
- [ ] Four numbers at the top: overdue tasks, due in 14 days, awaiting client, open requisitions.
- [ ] Filter chips All / Overdue / On track change the client list.
- [ ] Opening a client card shows an on-time bar and its next tasks; "Open client" goes to the client.
- [ ] The 14-day board shows today with a blue outline. If nothing is due it names the next deadline.
- [ ] Hovering a chart bar or line point shows a tooltip; "View as table" lists the same numbers.

## 3. Clients
- [ ] Add a client with PF, ESI, PT and TAN numbers filled in (state Karnataka). Its page lists filing tasks for those.
- [ ] A client with no registrations gets no compliance tasks.
- [ ] "Refresh calendar" adds nothing new the second time (no duplicates).
- [ ] Assign a second consultant; log in as them and the client appears.
- [ ] Create a portal login for a client, then sign in with it.
- [ ] Feature overrides: switch "Number and email masking" Off for one client; the badge says "Client override". "Use default" removes it.

## 4. Tasks
- [ ] Tasks are listed earliest first, overdue in red with a ✕ and "Overdue Nd".
- [ ] "Mark done" removes it from Pending and shows it under "Show completed".

## 5. Requisitions and profiles
- [ ] Create a requisition (2 openings). It appears in the list.
- [ ] Submit a profile with a phone number. It shows as Submitted.
- [ ] Submit another with the same phone written differently (`+91 98450-12345`): blocked as a duplicate.
- [ ] Same phone on a different requisition for the same client: allowed, with a warning.
- [ ] Move a profile Shortlisted, then Interview scheduled with a date, then Offered, then Joined. You cannot skip a step.
- [ ] When 2 profiles are Joined, the requisition closes by itself.

## 6. Job description protection
- [ ] Add a JD containing a phone number and an email. Both appear masked (`98XXXXXX01`).
- [ ] Edit the masked text, choose an expiry, "Approve and create link".
- [ ] Open the link in a private window (not signed in): the JD shows with your name stamped across it, and no phone or email.
- [ ] The view count on the requisition goes up. "Revoke" makes the link show "not found".
- [ ] Switch "JD watermark" Off for a client: the stamp disappears. Masking can stay on independently.

## 7. Client portal
- [ ] As the client: raise a requisition. The consultant's inbox gets "New requisition".
- [ ] Shortlist a profile with a comment. The consultant sees the stage change and comment.
- [ ] "Request interview" and "Reject" both work. Offered and Joined are not offered to the client.
- [ ] Switch "Client portal" Off for that client (as admin): the client sees "Portal unavailable".

## 8. Invoices
- [ ] In Settings, set your business state and GSTIN.
- [ ] Invoice a client in the same state: CGST 9% plus SGST 9%. A client in another state: IGST 18%.
- [ ] The number looks like `INV/2026-27/0001` and the next one counts up.
- [ ] "Mark as sent", then record a part payment (status Partially paid), then the rest (Paid). You cannot pay more than the balance.

## 9. Settings
- [ ] Switch a feature Off at account level: its menu item disappears (for example Invoicing). Data is still there when you switch it back On.
- [ ] The change log lists who switched what and when.
- [ ] The Automation card says "Running" after the jobs have run, and "Not running" if they have not for 10 minutes.

## 10. Inbox and reminders
- [ ] After running the jobs, the consultant's inbox shows overdue and due-soon alerts with a count on the bell.
- [ ] "Mark all read" clears the count.
- [ ] Save a WhatsApp number in the inbox (`98765 43210`); a bad number is rejected.
- [ ] Run the jobs twice: no duplicate alerts.
- [ ] Switch "WhatsApp reminders" Off for a client, run the jobs: nothing is printed for that client.

## 11. Access control (try to break it)
- [ ] As the consultant, paste the URL of a client they are not assigned to: "not found".
- [ ] As the client, paste a URL from another client's requisition: "not found".
- [ ] As a client, open an `/app/...` address: sent to the portal.

## 12. Resume matching
Needs a requisition with a JD (section 6). Sample PDF and Word resumes work; use a few real ones too.
- [ ] On a requisition, "Match resumes to JD" opens the match screen. Without a JD it says to add one first.
- [ ] Choose or drop 3 or more resumes. The list shows names and sizes; Remove works.
- [ ] A `.txt` or a file over 5 MB is skipped with a message.
- [ ] "Rank" shows each resume with a percentage, a band (Strong, Good, Partial, Weak) and matched and missing skills, best first.
- [ ] A resume clearly right for the JD ranks above one clearly wrong for it. Compare the order with your own judgement and note any resume you rank differently.
- [ ] "How this score was made" lists each part. The numbers add up to what you would expect.
- [ ] A scanned PDF shows under "Could not read" with a message; the other resumes are still ranked.
- [ ] "Submit this candidate to the client" is pre-filled. Fix any wrong field, submit: the profile appears on the requisition. Submitting the same phone or email again is blocked as a duplicate.
- [ ] As a consultant, open the match address of a client not assigned to you: "not found".
- [ ] As the client user, open the match address: sent to the portal. A direct call to `/api/resumes/match` is refused.
- [ ] The change log (Settings) shows a "resume.match" entry.
- [ ] After submitting from the match screen, the profile on the requisition shows "Match NN%". "Why NN% match" opens the reasons.
- [ ] A profile added with the manual "Submit a profile" form has no match badge.
- [ ] Once at least one profile has a score, "Sort: Best match" appears and puts scored profiles first, highest first.
- [ ] In the browser inspector, change the hidden `matchToken` value before submitting: the profile is still created but with no match score.
- [ ] As the client, open the requisition in the portal: candidates show, but no match percentage anywhere.
- [ ] A candidate with a fractional experience such as 3.9 years submits without a browser validation error.

## 13. Password reset and sign-in limits
In development the reset link is printed in the terminal running `npm run dev` (look for `[email]`).
- [ ] On the sign-in page, "Forgot your password?" opens `/forgot-password`.
- [ ] A known and an unknown email show the same message. Nothing says whether the account exists.
- [ ] The link opens "Choose a new password". Mismatched or short passwords are refused.
- [ ] After changing it, you land on sign-in with "Password changed". The new password works; the old one does not.
- [ ] Open the same link again: "This link no longer works". Request two links in a row: only the newest works.
- [ ] Stay signed in on one browser, reset the password from another: the first browser is signed out on its next click.
- [ ] Five wrong passwords for one email: the next try, even with the right password, says "Too many sign-in attempts". Resetting the password lifts it.
- [ ] Request a fourth reset link for the same email within an hour: the message is the same but no new link is printed.
- [ ] Demo logins (`admin@demo.test`) get no reset link.
