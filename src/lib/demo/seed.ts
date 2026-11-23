// Demo consultancy with a full set of sample data, for showing the product to prospective clients.
//
// resetDemo() deletes the demo consultancy (flagged isDemo) and builds a fresh one. It never touches any other
// consultancy, so it is safe to run on a database that also holds real accounts.
// Dates are relative to "now", so the data always looks current (some tasks overdue, some due soon).
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Client, PrismaClient, ProfileStage, User } from "@prisma/client";
import { defaultWindow, generateComplianceTasks } from "@/lib/compliance/generate";
import { maskContactDetails } from "@/lib/jd/mask";
import { computeGst, invoiceNumber, rupeesToPaise } from "@/lib/billing/gst";
import { emailKey, phoneKey } from "@/lib/requisition/stages";
import { DEMO_CONSULTANCY, DEMO_LOGINS } from "./mode";

const DAY = 86_400_000;

/** DEMO_PASSWORD if set. Otherwise "demo12345" on a developer machine and a random one in production (the one-click buttons still work). */
export function demoPassword(): string {
  return process.env.DEMO_PASSWORD || (process.env.NODE_ENV === "production" ? randomBytes(18).toString("base64url") : "demo12345");
}

const PATH: ProfileStage[] = ["SUBMITTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "OFFERED", "JOINED"];

interface Person { name: string; phone: string; email: string; company: string; years: number; ctc: number; expected: number; notice: number; stage: ProfileStage; daysAgo: number }

export interface DemoResult { consultancyId: string; adminId: string; counts: Record<string, number> }

export async function resetDemo(db: PrismaClient, now = new Date()): Promise<DemoResult> {
  // Also clears the older, unflagged demo made by the previous seed (same name, only @demo.test users).
  await db.consultancy.deleteMany({ where: { OR: [{ isDemo: true }, { name: DEMO_CONSULTANCY, users: { every: { email: { endsWith: "@demo.test" } } } }] } });

  const hash = await bcrypt.hash(demoPassword(), 10);
  const at = (days: number) => new Date(now.getTime() + days * DAY);

  const c = await db.consultancy.create({
    data: { name: DEMO_CONSULTANCY, plan: "PRO", state: "KA", gstin: "29ABCDE1234F1Z5", address: "12 MG Road, Bengaluru 560001", isDemo: true, nextInvoiceNo: 6 },
  });
  const mkUser = (name: string, email: string, role: User["role"], extra: { phone?: string; clientId?: string } = {}) =>
    db.user.create({ data: { consultancyId: c.id, name, email, passwordHash: hash, role, ...extra } });

  const admin = await mkUser("Santhosh R", DEMO_LOGINS.admin.email, "ADMIN", { phone: "9800000101" });
  const meera = await mkUser("Meera Iyer", DEMO_LOGINS.consultant.email, "CONSULTANT", { phone: "9800000102" });
  const karan = await mkUser("Karan Shah", "karan@demo.test", "CONSULTANT", { phone: "9800000103" });

  const mkClient = (name: string, state: string, gstin: string, regs: Partial<Client>, contact: { name: string; phone: string; email?: string }) =>
    db.client.create({ data: { consultancyId: c.id, name, state, gstin, ...regs, contacts: { create: { ...contact, isPrimary: true } } } });

  const acme = await mkClient("Acme Textiles Pvt Ltd", "KA", "29AAACA1111A1Z1", { pfNumber: "KABLR0012345", esiNumber: "5300012345", ptNumber: "PT-KA-001", tan: "BLRA12345B" }, { name: "Ravi Kumar", phone: "9800000001", email: "ravi@acme.example" });
  const zenith = await mkClient("Zenith Logistics LLP", "MH", "27AAACZ2222B1Z2", { pfNumber: "MHBAN0054321", tan: "MUMZ54321C" }, { name: "Anita Desai", phone: "9800000002", email: "anita@zenith.example" });
  const bluewave = await mkClient("Bluewave Pharma Ltd", "TN", "33AAACB3333C1Z3", { pfNumber: "TNMAS0098765", esiNumber: "5100098765", ptNumber: "PT-TN-014", tan: "CHEB98765D" }, { name: "Dr. Lakshmi Narayan", phone: "9800000003", email: "lakshmi@bluewave.example" });
  const greenfield = await mkClient("Greenfield Foods", "KA", "29AAACG4444D1Z4", { pfNumber: "KABLR0076543", tan: "BLRG76543E" }, { name: "Imran Pasha", phone: "9800000004" });

  await db.clientAssignment.createMany({
    data: [
      ...[acme, zenith, bluewave, greenfield].map((x) => ({ userId: admin.id, clientId: x.id })),
      { userId: meera.id, clientId: acme.id },
      { userId: meera.id, clientId: greenfield.id },
      { userId: karan.id, clientId: zenith.id },
      { userId: karan.id, clientId: bluewave.id },
    ],
  });
  await mkUser("Ravi Kumar", DEMO_LOGINS.client.email, "CLIENT_USER", { clientId: acme.id });

  // Per-client switch overrides, so that screen has something to show.
  await db.featureSetting.createMany({
    data: [
      { consultancyId: c.id, scope: zenith.id, clientId: zenith.id, key: "jd_watermark", enabled: false },
      { consultancyId: c.id, scope: greenfield.id, clientId: greenfield.id, key: "whatsapp_reminders", enabled: false },
    ],
  });

  // Compliance calendar from last month to three months ahead. Past filings are done, except one overdue per
  // main client, so the dashboard has something to flag.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const { to } = defaultWindow(now);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const owners = new Map<string, string>([[acme.id, meera.id], [zenith.id, karan.id], [bluewave.id, karan.id], [greenfield.id, meera.id]]);
  const overdue = new Map<string, string>([[acme.id, "PF"], [zenith.id, "TDS"]]);
  let taskCount = 0;
  for (const client of [acme, zenith, bluewave, greenfield]) {
    const regs = { pf: !!client.pfNumber, esi: !!client.esiNumber, pt: !!client.ptNumber, tds: !!client.tan, lwf: !!client.lwfNumber };
    const gen = generateComplianceTasks({ id: client.id, state: client.state, ...regs }, from, to);
    const stillOverdue = new Set<string>();
    const rows = gen.map((g) => {
      const past = g.dueDate.getTime() < todayMs - 2 * DAY;
      // Leave only the most recent past filing of one kind undone.
      const keepOpen = past && g.kind === overdue.get(client.id) && !stillOverdue.has(client.id) && g.dueDate.getTime() >= todayMs - 20 * DAY;
      if (keepOpen) stillOverdue.add(client.id);
      const done = past && !keepOpen;
      return { consultancyId: c.id, clientId: client.id, title: g.title, dueDate: g.dueDate, assigneeId: owners.get(client.id)!, complianceKind: g.kind, period: g.period, sourceKey: g.sourceKey, status: done ? ("DONE" as const) : ("TODO" as const), completedAt: done ? new Date(g.dueDate.getTime() - DAY) : null };
    });
    taskCount += (await db.task.createMany({ skipDuplicates: true, data: rows })).count;
  }
  const manual = [
    { client: acme, title: "Quarterly HR audit: collect attendance registers", days: 5, status: "IN_PROGRESS" as const, who: meera },
    { client: acme, title: "Appraisal cycle kick-off letters", days: 12, status: "TODO" as const, who: meera },
    { client: zenith, title: "Renew shops and establishment licence", days: 9, status: "TODO" as const, who: karan },
    { client: bluewave, title: "Review contract-labour agreements", days: -2, status: "TODO" as const, who: karan },
    { client: greenfield, title: "Update leave policy after state circular", days: 18, status: "TODO" as const, who: meera },
  ];
  await db.task.createMany({ data: manual.map((m) => ({ consultancyId: c.id, clientId: m.client.id, title: m.title, dueDate: new Date(todayMs + m.days * DAY), assigneeId: m.who.id, status: m.status })) });
  taskCount += manual.length;

  // Requisitions and candidates across every stage.
  const reqs = [
    { client: acme, title: "Senior Accountant", openings: 2, min: 600000, max: 900000, deadlineDays: 21, by: meera, status: "OPEN" as const, source: "CONSULTANT" as const },
    { client: acme, title: "Payroll Executive", openings: 1, min: 350000, max: 500000, deadlineDays: 30, by: meera, status: "OPEN" as const, source: "PORTAL" as const },
    { client: zenith, title: "Fleet Operations Manager", openings: 1, min: 1200000, max: 1800000, deadlineDays: 14, by: karan, status: "OPEN" as const, source: "CONSULTANT" as const },
    { client: bluewave, title: "QA Analyst", openings: 1, min: 450000, max: 650000, deadlineDays: -10, by: karan, status: "CLOSED" as const, source: "CONSULTANT" as const },
    { client: bluewave, title: "Production Chemist", openings: 3, min: 400000, max: 600000, deadlineDays: 40, by: karan, status: "OPEN" as const, source: "CONSULTANT" as const },
  ];
  const people: Person[][] = [
    [
      { name: "Priya Nair", phone: "9845012345", email: "priya.nair@mail.example", company: "Sundaram Fabrics", years: 7, ctc: 720000, expected: 850000, notice: 30, stage: "SUBMITTED", daysAgo: 5 },
      { name: "Arjun Rao", phone: "9845012346", email: "arjun.rao@mail.example", company: "Kaveri Mills", years: 5.5, ctc: 640000, expected: 780000, notice: 45, stage: "SUBMITTED", daysAgo: 1 },
      { name: "Divya Menon", phone: "9845012347", email: "divya.m@mail.example", company: "Lotus Textiles", years: 8, ctc: 800000, expected: 900000, notice: 60, stage: "SHORTLISTED", daysAgo: 4 },
      { name: "Karthik S", phone: "9845012348", email: "karthik.s@mail.example", company: "Brigade Garments", years: 6, ctc: 700000, expected: 820000, notice: 30, stage: "INTERVIEW_SCHEDULED", daysAgo: 6 },
      { name: "Sneha Pillai", phone: "9845012349", email: "sneha.p@mail.example", company: "Orchid Exports", years: 4, ctc: 520000, expected: 640000, notice: 15, stage: "REJECTED", daysAgo: 9 },
    ],
    [
      { name: "Rohit Verma", phone: "9845022341", email: "rohit.v@mail.example", company: "Prime Payroll Services", years: 3.5, ctc: 380000, expected: 450000, notice: 30, stage: "SUBMITTED", daysAgo: 4 },
      { name: "Fatima Sheikh", phone: "9845022342", email: "fatima.s@mail.example", company: "Zoom HR", years: 5, ctc: 420000, expected: 500000, notice: 30, stage: "SHORTLISTED", daysAgo: 2 },
    ],
    [
      { name: "Vikram Joshi", phone: "9845032341", email: "vikram.j@mail.example", company: "Western Freight", years: 12, ctc: 1500000, expected: 1750000, notice: 90, stage: "OFFERED", daysAgo: 8 },
      { name: "Sanjay Kulkarni", phone: "9845032342", email: "sanjay.k@mail.example", company: "Konkan Cargo", years: 10, ctc: 1300000, expected: 1600000, notice: 60, stage: "INTERVIEW_SCHEDULED", daysAgo: 3 },
      { name: "Neha Patil", phone: "9845032343", email: "neha.patil@mail.example", company: "Blue Dart Partner", years: 9, ctc: 1250000, expected: 1500000, notice: 45, stage: "SUBMITTED", daysAgo: 2 },
    ],
    [
      { name: "Anand Raman", phone: "9845042341", email: "anand.r@mail.example", company: "Apollo Labs", years: 4, ctc: 480000, expected: 600000, notice: 30, stage: "JOINED", daysAgo: 25 },
      { name: "Meenakshi V", phone: "9845042342", email: "meenakshi.v@mail.example", company: "Cipla Contract Unit", years: 3, ctc: 420000, expected: 560000, notice: 30, stage: "REJECTED", daysAgo: 28 },
    ],
    [
      { name: "Ganesh Babu", phone: "9845052341", email: "ganesh.b@mail.example", company: "Madras Pharma Works", years: 5, ctc: 450000, expected: 560000, notice: 30, stage: "SHORTLISTED", daysAgo: 3 },
      { name: "Revathi K", phone: "9845052342", email: "revathi.k@mail.example", company: "Sun Labs", years: 6, ctc: 500000, expected: 590000, notice: 45, stage: "SUBMITTED", daysAgo: 6 },
    ],
  ];

  let profileCount = 0;
  const reqRows = [];
  for (const [i, r] of reqs.entries()) {
    const req = await db.requisition.create({
      data: { consultancyId: c.id, clientId: r.client.id, title: r.title, openings: r.openings, budgetMin: r.min, budgetMax: r.max, deadline: at(r.deadlineDays), status: r.status, source: r.source, createdById: r.by.id, createdAt: at(-30), closedAt: r.status === "CLOSED" ? at(-8) : null },
    });
    reqRows.push(req);
    for (const p of people[i]!) {
      const submitted = at(-p.daysAgo);
      const profile = await db.profile.create({
        data: { requisitionId: req.id, name: p.name, phone: p.phone, email: p.email, phoneKey: phoneKey(p.phone), emailKey: emailKey(p.email), currentCompany: p.company, experienceYears: p.years, currentCtc: p.ctc, expectedCtc: p.expected, noticeDays: p.notice, stage: p.stage, submittedAt: submitted, stageChangedAt: p.stage === "SUBMITTED" ? submitted : at(-Math.max(1, p.daysAgo - 2)) },
      });
      // Event history: submitted, then each step up to the current stage (rejections branch off the previous step).
      const steps: ProfileStage[] = p.stage === "REJECTED" ? ["SUBMITTED", "SHORTLISTED", "REJECTED"] : PATH.slice(0, PATH.indexOf(p.stage) + 1);
      await db.profileEvent.createMany({
        data: steps.map((to, k) => ({ profileId: profile.id, fromStage: k === 0 ? null : steps[k - 1]!, toStage: to, comment: k === 0 ? "Profile submitted" : null, actorId: r.by.id, at: new Date(submitted.getTime() + k * DAY) })),
      });
      if (p.stage === "INTERVIEW_SCHEDULED") await db.interview.create({ data: { profileId: profile.id, scheduledAt: at(2), mode: "VIDEO", location: "Google Meet" } });
      profileCount++;
    }
  }

  const jdText = "We are hiring a Senior Accountant for our Bengaluru plant.\nCTC 6 to 9 LPA. Send CVs to hr@acme.example or call Ravi on +91 98000 00001.";
  const jd = await db.jobDescription.create({
    data: { requisitionId: reqRows[0]!.id, originalText: jdText, maskedText: maskContactDetails(jdText).text, watermarkName: meera.name, createdById: meera.id, approved: true, shareLinks: { create: { token: "demo-share-link-token", createdById: meera.id, expiresAt: at(14) } } },
    include: { shareLinks: true },
  });
  await db.shareLinkView.createMany({ data: [{ linkId: jd.shareLinks[0]!.id, viewedAt: at(-1), userAgent: "Chrome on Windows" }, { linkId: jd.shareLinks[0]!.id, viewedAt: at(-0.2), userAgent: "Safari on iPhone" }] });

  // Invoices in every state. Karnataka to Karnataka splits into CGST and SGST; other states use IGST.
  const invoiceDefs = [
    { client: acme, seq: 1, status: "PAID" as const, issue: -35, due: -20, rupees: 25000, desc: "Monthly HR retainer (previous month)", paid: 1 },
    { client: acme, seq: 2, status: "SENT" as const, issue: -3, due: 12, rupees: 25000, desc: "Monthly HR retainer", paid: 0 },
    { client: zenith, seq: 3, status: "SENT" as const, issue: -25, due: -6, rupees: 85000, desc: "Placement fee: Fleet Operations Manager (part)", paid: 0 },
    { client: bluewave, seq: 4, status: "PARTIALLY_PAID" as const, issue: -18, due: 4, rupees: 60000, desc: "Placement fee: QA Analyst", paid: 0.5 },
    { client: greenfield, seq: 5, status: "DRAFT" as const, issue: 0, due: 15, rupees: 15000, desc: "Policy review and handbook update", paid: 0 },
  ];
  for (const d of invoiceDefs) {
    const sub = rupeesToPaise(d.rupees);
    const issue = at(d.issue);
    const inv = await db.invoice.create({
      data: {
        consultancyId: c.id, clientId: d.client.id, number: invoiceNumber("INV", d.seq, issue), status: d.status, feeModel: d.desc.startsWith("Monthly") ? "RETAINER" : "FIXED",
        issueDate: issue, dueDate: at(d.due), placeOfSupply: d.client.state, ...computeGst(sub, "KA", d.client.state),
        lines: { create: { description: d.desc, quantity: 1, ratePaise: sub, amountPaise: sub } },
      },
    });
    if (d.paid > 0) {
      const total = inv.totalPaise;
      await db.payment.create({ data: { invoiceId: inv.id, amountPaise: Math.round(total * d.paid), method: d.paid === 1 ? "UPI" : "BANK", reference: d.paid === 1 ? "UPI-2026-0091" : "NEFT-77120", paidAt: at(d.issue + 12) } });
    }
  }

  return { consultancyId: c.id, adminId: admin.id, counts: { clients: 4, users: 4, tasks: taskCount, requisitions: reqs.length, profiles: profileCount, invoices: invoiceDefs.length } };
}

/** True when a demo consultancy already exists. */
export async function demoExists(db: PrismaClient): Promise<boolean> {
  return (await db.consultancy.count({ where: { isDemo: true } })) > 0;
}
