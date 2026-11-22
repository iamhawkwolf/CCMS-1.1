# HR Consultancy Platform: Features and Workflows

Source: *HR Consultancy Software for India: Product Feature Plan* (private draft). This file turns that plan into a build list. Features are grouped by module and tagged V1, V2, V3 or Later, following the plan's build order (section 8).

---

## 1. Product in one line

A multi-client platform where one Indian HR consultancy runs all its client companies from a single login. It covers consultant workflow, Indian statutory compliance, requisition tracking, JD protection and billing in rupees.

## 2. Users and roles

| Role | Who | Can do |
|---|---|---|
| **Consultancy Admin** | Owner of the account (for example Santhosh's customer) | Everything. Sets feature defaults, plans, billing, team and client assignments. |
| **Consultant** | Staff member of the consultancy | Works only on clients assigned to them. Permissions are role-based. |
| **Client User** | HR or owner at a client company | Uses the client portal only: raises requisitions, reviews profiles, approves, uploads. |
| **Employee / Candidate** | End person at a client | Employee-facing screens and document upload links (V2+). Regional languages come later. |
| **Platform Owner** | You | Plans, feature availability per plan, support, account management. |

## 3. Cross-cutting foundations (build first)

These underpin every other module.

1. **Multi-tenancy.** The Consultancy is the tenant. Each Client Company is an isolated workspace inside it. Every record carries `consultancy_id` and `client_id`, and every query is scoped by both.
2. **Role-based access.** Consultants are assigned to specific clients. Client users see only their own company.
3. **Feature switches (two levels).**
   - The Admin sets the default for the whole account.
   - The Admin can override per client company, for example watermark on for Client A and off for Client B.
   - Sub-settings are separate switches, so watermark and number masking toggle independently.
   - Turning a feature off hides it and stops its reminders, but keeps all data.
   - The consultancy's **plan** decides which switches are available at all.
   - A **change log** records who switched what and when.
4. **Notifications engine.** One service for WhatsApp, email and in-app messages. It supports templates, scheduling, retries and a per-client switch.
5. **Audit log.** Records who did what, which is important once salary, PF and personal data are stored.
6. **Document storage.** Per-client storage with access control and signed, expiring links.

## 4. Feature list by module

### A. Multi-client workspace (V1)
- Multi-client dashboard with one login and a card or list per client showing pending, overdue and due-soon work.
- Client profile with company details, contacts, notes, state(s) of operation, and statutory registration numbers (PF, ESI, PT, TAN, GST).
- Staff profile: every employee at each client (basic record in V1, full lifecycle in V2).
- Team management: add consultants, assign them to clients, set role permissions.

### B. Tasks and compliance calendar (V1)
- Projects and task boards with owner, due date, status, comments and attachments.
- **Recurring tasks** such as monthly payroll run and monthly filings.
- **Compliance calendar** that auto-generates due dates for PF, ESI, Professional Tax, TDS and Labour Welfare Fund per client. Dates depend on the client's state and registrations.
- Alerts before deadlines (for example 7, 3 and 1 day) to the assigned consultant, with escalation to the admin when overdue.
- "Overdue and pending" view across all clients.
- Minimum wage, gratuity and bonus reminders (rules maintained by the platform owner).

### C. Requisition and profile tracker (V1, the main differentiator)
- Requisition fields: role, openings, budget, deadline, JD attachment. It is raised by the client in the portal, or logged by the consultant from a call or WhatsApp.
- Consultant uploads candidate profiles against a requisition.
- **Duplicate profile detection** by phone, email and name plus company.
- Client sees all candidates in one list and can shortlist, reject or request an interview in one click, with comments. The consultant is notified instantly.
- Stages: Submitted, Shortlisted, Interview Scheduled, Offered, Joined, Rejected.
- Auto reminders on WhatsApp and email when profiles have not been reviewed within N days (configurable per client).
- Interview scheduling and feedback stored on the profile.
- Full history per requisition.
- Feeds analytics: open requisitions, profiles pending client review, time to fill, ageing.

### D. JD watermark and number masking (V1)
- Auto-stamp every uploaded JD with the consultant's name and logo (switch 1).
- Detect phone numbers and emails in the JD and mask them (switch 2). Example: `98XXXXXX10`.
- Consultant reviews the masked result before sharing.
- Tracked, view-only share links with optional expiry. The consultant sees who opened them and when.
- Known limit, shown in the UI: this deters leaks but cannot stop someone retyping a number by hand.

### E. Client portal (V1)
- Separate login for client users, with the consultancy's branding.
- Raise requisitions, review and act on profiles, view reports.
- Approve payroll and upload attendance (payroll items arrive in V3, but the approval and upload mechanics are built generically).
- Switchable per client.

### F. Invoicing and billing (V1)
- Fee models: retainer, fixed fee, hourly and per-head.
- GST invoices with GSTIN, HSN/SAC, CGST/SGST/IGST split by state, and sequential numbering.
- UPI and Razorpay payment links on the invoice.
- Automatic payment reminders (email and WhatsApp).
- Payment status tracking and receipts.
- Time tracking: timers on tasks linked to project budgets (feeds hourly billing).

### G. WhatsApp reminders (V1)
- Reminders for client review of profiles, document requests, compliance alerts and invoice dues.
- Uses WhatsApp Business API with pre-approved message templates.
- Per-client on/off switch and opt-out handling.

### H. Basic analytics (V1) and deeper analytics (V3)
- V1: per-client reports (open requisitions, pending reviews, time to fill, ageing) and consultant view (revenue per client, overdue invoices).
- V1: **branded monthly report** auto-sent to each client.
- V3: headcount, attrition, leave patterns, payroll cost trends, profitability (revenue vs hours).

### I. V2 modules
- **Candidate database:** searchable pool across requisitions, with tags and history.
- **Interview scheduling:** booking pages and calendar sync.
- **Onboarding and exit workflows:** document collection, KYC, background-verification tracking, full and final settlement checklist.
- **Document vault:** contracts, policies and employee documents per client.
- **Policy and handbook builder:** templates under Indian labour law, including POSH, leave policy and code of conduct.

### J. V3 modules
- **Payroll integrations** with SaachiHRMS, INDPayroll, greytHR and Tally. The goal is to integrate, not to compete on payroll.
- **Contract staffing:** deploy staff to client sites, track attendance, auto-generate per-head billing.

### K. Later
- Own multi-company payroll (only if customers demand it).
- AI compliance assistant.
- Regional languages (Kannada, Hindi, Tamil and others) on employee-facing screens.

## 5. Workflows

### W1. Consultancy sign-up and set-up
1. Admin signs up, picks a plan (Starter, Growth or Pro) and enters consultancy details, logo and GST number.
2. Admin sets **account-level feature defaults** within what the plan allows.
3. Admin invites consultants and sets roles.
4. Admin adds the first client (W2).

### W2. Adding a client company
1. Admin or Consultant creates the client with company details, contacts, state(s) and registration numbers.
2. System **generates the compliance calendar** from those registrations and states (W3).
3. Admin assigns consultants to the client.
4. Optional: override feature switches for this client, then invite client users to the portal.
5. Plan limits are enforced (for example Starter allows 5 clients).

### W3. Compliance calendar to filing
1. Client registrations (PF, ESI, PT, TDS, LWF) and state generate recurring tasks with due dates.
2. Task is assigned to the client's consultant.
3. Reminders fire before the deadline, then escalate to the admin if overdue.
4. Consultant completes the task, attaches the challan or acknowledgement and marks it done.
5. Next period's task is created automatically.
6. The dashboard and the monthly report reflect on-time vs late filings.

### W4. Requisition to placement (core workflow)
1. **Raise:** client creates a requisition in the portal, or the consultant logs it from a call or WhatsApp message.
2. **JD protection:** JD is uploaded, watermarked, contact details are masked, and the consultant reviews it. It is shared by a tracked view-only link (W5).
3. **Source:** consultant uploads profiles against the requisition. Duplicates are flagged.
4. **Submit:** profiles appear in the client's list, stage = *Submitted*.
5. **Review:** client shortlists, rejects or requests an interview with a comment. The consultant is notified immediately.
6. **Chase:** if there is no client action within N days, WhatsApp and email reminders go out automatically.
7. **Interview:** consultant schedules it, feedback is recorded on the profile, stage = *Interview Scheduled*.
8. **Offer:** stage = *Offered*, offer letter generated.
9. **Close:** stage = *Joined* or *Rejected*. When all openings are filled, the requisition closes.
10. Time to fill and ageing update the analytics. If a placement fee applies, it flows to invoicing (W6).

### W5. Sharing a JD safely
1. Consultant uploads the JD.
2. System stamps name and logo (if the switch is on).
3. System detects phone numbers and emails and masks them (if the switch is on).
4. Consultant previews, edits the masking if needed and approves.
5. Consultant creates a view-only link with optional expiry.
6. Each open is logged, and the consultant sees who viewed and when.
7. Link is revoked or expires.

### W6. Billing and collection
1. Fee plan is set per client (retainer, fixed, hourly or per-head).
2. Invoice is generated on schedule or on demand. Hourly lines pull from time tracked on tasks.
3. GST invoice is created with correct tax split and number series.
4. Invoice is sent with a UPI or Razorpay link.
5. Automatic reminders go out until paid.
6. Payment is reconciled and the receipt is issued.
7. Overdue invoices show on the consultant business view.

### W7. Monthly report to client
1. On a set date, the system compiles the client's report: compliance filed on time, requisitions and placements, pending items, and so on.
2. Report is branded with the consultancy's logo.
3. It is emailed or WhatsApped to the client contact and visible in the portal.
4. Purpose: show value at renewal and pricing time.

### W8. Turning a feature on or off
1. Admin opens settings and picks account default or a specific client.
2. Admin flips a switch (only those allowed by the plan are shown).
3. Feature UI is hidden and its reminders stop. **Data is kept.**
4. Change log records user, switch, old and new value, and time.
5. Turning it back on restores everything.

### W9. Onboarding and exit (V2)
- **Onboard:** employee record created, document-collection request sent (WhatsApp link), KYC captured, background verification tracked, checklist completed.
- **Exit:** resignation logged, notice and handover checklist, full and final settlement calculated or attached, documents issued, record archived.

### W10. Contract staffing billing (V3)
1. Staff are deployed to a client site.
2. Daily attendance is uploaded by the client or marked by a supervisor.
3. At month end the system calculates per-head billing from attendance.
4. Client approves in the portal and the invoice is generated (W6).

## 6. Plans and switches

| Plan | Price (approx.) | Limits | Notes |
|---|---|---|---|
| Starter | ₹999/month | 1 consultant, up to 5 clients | Core V1 modules |
| Growth | ₹2,499/month | Up to 25 clients, 3 team members | More switches enabled |
| Pro | ₹4,999/month | Unlimited clients, payroll and analytics | Everything |

Every module is a switch, and the plan controls which switches exist for that account.

## 7. Build order

- **Version 1:** foundations (section 3), multi-client dashboard, profiles, tasks with compliance calendar, requisition tracker with client portal, JD watermark and masking, basic analytics, GST invoicing, WhatsApp reminders.
- **Version 2:** candidate database, interview scheduling, onboarding and exit, document vault, policy builder.
- **Version 3:** payroll integrations, contract staffing billing, deeper analytics.
- **Later:** own payroll, AI compliance assistant, regional languages.

## 8. Points to settle before building

These come from the plan and are not decided in it.

1. **WhatsApp templates.** Business-initiated messages need Meta-approved templates, so reminder wording must be fixed early.
2. **Compliance rule data.** Due dates and rates differ by state and change over time. Decide who maintains them (the plan has a CA budget line).
3. **Personal data.** Candidate profiles, and later salary and PF data, fall under India's DPDP Act. Consent, retention and access controls should be designed in from V1. The plan already budgets for the privacy policy and security work.
4. **Masking accuracy.** Detection will miss numbers written as words or split with spaces, which is why the consultant review step stays in.
5. **Payroll scope.** The plan says integrate, not build. Confirm which integration is first (SaachiHRMS, INDPayroll, greytHR or Tally).
6. **Validation.** The plan's next step is to call 10 Bangalore consultancies and ask which three features they would pay for first. That answer can reorder V1.
