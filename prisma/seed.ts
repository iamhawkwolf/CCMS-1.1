// Demo data for local development. Safe to re-run: it wipes the demo consultancy first.
// Logins (dev only): admin@demo.test / consultant@demo.test / client@demo.test, password "demo12345".
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultWindow, generateComplianceTasks } from "../src/lib/compliance/generate";
import { maskContactDetails } from "../src/lib/jd/mask";
import { computeGst, invoiceNumber, rupeesToPaise } from "../src/lib/billing/gst";
import { emailKey, phoneKey } from "../src/lib/requisition/stages";

const db = new PrismaClient();

async function main() {
  await db.user.deleteMany({ where: { email: { endsWith: "@demo.test" } } });
  await db.consultancy.deleteMany({ where: { name: "Demo HR Advisors" } });

  const hash = await bcrypt.hash("demo12345", 10);
  const c = await db.consultancy.create({ data: { name: "Demo HR Advisors", plan: "PRO", state: "KA", gstin: "29ABCDE1234F1Z5", nextInvoiceNo: 2 } });
  const admin = await db.user.create({ data: { consultancyId: c.id, name: "Santhosh R", email: "admin@demo.test", passwordHash: hash, role: "ADMIN" } });
  const consultant = await db.user.create({ data: { consultancyId: c.id, name: "Meera Iyer", email: "consultant@demo.test", passwordHash: hash, role: "CONSULTANT" } });

  const acme = await db.client.create({ data: { consultancyId: c.id, name: "Acme Textiles Pvt Ltd", state: "KA", gstin: "29AAACA1111A1Z1", pfNumber: "KABLR0012345", esiNumber: "5300012345", ptNumber: "PT-KA-001", tan: "BLRA12345B", contacts: { create: { name: "Ravi Kumar", phone: "+919800000001", email: "ravi@acme.example", isPrimary: true } } } });
  const zen = await db.client.create({ data: { consultancyId: c.id, name: "Zenith Logistics LLP", state: "MH", gstin: "27AAACZ2222B1Z2", pfNumber: "MHBAN0054321", tan: "MUMZ54321C", contacts: { create: { name: "Anita Desai", phone: "+919800000002", isPrimary: true } } } });
  await db.clientAssignment.createMany({ data: [{ userId: admin.id, clientId: acme.id }, { userId: admin.id, clientId: zen.id }, { userId: consultant.id, clientId: acme.id }] });
  await db.user.create({ data: { consultancyId: c.id, clientId: acme.id, name: "Ravi Kumar", email: "client@demo.test", passwordHash: hash, role: "CLIENT_USER" } });

  // Per-client override example: Zenith has the JD watermark off.
  await db.featureSetting.create({ data: { consultancyId: c.id, scope: zen.id, clientId: zen.id, key: "jd_watermark", enabled: false } });

  // Compliance tasks, starting a month back so the demo shows an overdue item.
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const { to } = defaultWindow(now);
  for (const [client, regs, owner] of [
    [acme, { pf: true, esi: true, pt: true, tds: true, lwf: false }, consultant.id],
    [zen, { pf: true, esi: false, pt: false, tds: true, lwf: false }, admin.id],
  ] as const) {
    const gen = generateComplianceTasks({ id: client.id, state: client.state, ...regs }, from, to);
    await db.task.createMany({ skipDuplicates: true, data: gen.map((g) => ({ consultancyId: c.id, clientId: client.id, title: g.title, dueDate: g.dueDate, assigneeId: owner, complianceKind: g.kind, period: g.period, sourceKey: g.sourceKey })) });
  }

  // A requisition with candidates in several stages.
  const req = await db.requisition.create({ data: { consultancyId: c.id, clientId: acme.id, title: "Senior Accountant", openings: 2, budgetMin: 600000, budgetMax: 900000, deadline: new Date(Date.now() + 21 * 86400000), createdById: consultant.id } });
  const people: Array<[string, string, string, "SUBMITTED" | "SHORTLISTED" | "INTERVIEW_SCHEDULED" | "OFFERED", number]> = [
    ["Priya Nair", "9845012345", "priya.nair@mail.example", "SUBMITTED", 5],
    ["Arjun Rao", "9845012346", "arjun.rao@mail.example", "SUBMITTED", 1],
    ["Divya Menon", "9845012347", "divya.m@mail.example", "SHORTLISTED", 4],
    ["Karthik S", "9845012348", "karthik.s@mail.example", "INTERVIEW_SCHEDULED", 6],
  ];
  for (const [name, phone, email, stage, daysAgo] of people) {
    const at = new Date(Date.now() - daysAgo * 86400000);
    await db.profile.create({ data: { requisitionId: req.id, name, phone, email, phoneKey: phoneKey(phone), emailKey: emailKey(email), currentCompany: "Previous Co", experienceYears: 4 + daysAgo / 2, expectedCtc: 750000, noticeDays: 30, stage, submittedAt: at, stageChangedAt: at, events: { create: { toStage: stage === "SUBMITTED" ? "SUBMITTED" : stage, comment: "Seeded", actorId: consultant.id, at } } } });
  }
  const jdText = "We are hiring a Senior Accountant for our Bengaluru plant.\nCTC 6 to 9 LPA. Send CVs to hr@acme.example or call Ravi on +91 98000 00001.";
  await db.jobDescription.create({ data: { requisitionId: req.id, originalText: jdText, maskedText: maskContactDetails(jdText).text, watermarkName: consultant.name, createdById: consultant.id, approved: true, shareLinks: { create: { token: "demo-share-link-token", createdById: consultant.id, expiresAt: new Date(Date.now() + 14 * 86400000) } } } });

  // One sent invoice, intra-state so it splits into CGST and SGST.
  const sub = rupeesToPaise(25000);
  await db.invoice.create({ data: { consultancyId: c.id, clientId: acme.id, number: invoiceNumber("INV", 1, now), status: "SENT", feeModel: "RETAINER", dueDate: new Date(Date.now() + 10 * 86400000), placeOfSupply: acme.state, ...computeGst(sub, "KA", acme.state), lines: { create: { description: "Monthly HR retainer", quantity: 1, ratePaise: sub, amountPaise: sub } } } });

  console.log("Seeded. Sign in as admin@demo.test / consultant@demo.test / client@demo.test (password: demo12345)");
}

main().finally(() => db.$disconnect());
