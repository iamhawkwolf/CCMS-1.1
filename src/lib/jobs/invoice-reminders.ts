import { db } from "@/lib/db";
import { formatRupees } from "@/lib/billing/gst";
import { loadFeatureCheck } from "@/lib/features/bulk";
import { queueSafely } from "@/lib/notify";
import { daysUntil, formatDate } from "@/lib/time";
import { invoiceBucket } from "./rules";

/** WhatsApp reminders to the client's contact for unpaid invoices: once before the due date, weekly after. */
export async function runInvoiceReminders(now = new Date()): Promise<Record<string, number>> {
  const [invoices, isOn] = await Promise.all([
    db.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, client: { active: true } },
      include: { payments: { select: { amountPaise: true } }, consultancy: { select: { name: true, plan: true } } },
    }),
    loadFeatureCheck(),
  ]);

  const out = { invoices: invoices.length, queued: 0, duplicate: 0, skipped: 0, noContact: 0, featureOff: 0 };
  for (const inv of invoices) {
    const bucket = invoiceBucket(daysUntil(inv.dueDate, now));
    if (!bucket) continue;
    if (!isOn(inv.consultancyId, inv.clientId, "invoicing")) {
      out.featureOff++;
      continue;
    }
    const contact = await db.clientContact.findFirst({ where: { clientId: inv.clientId, phone: { not: null } }, orderBy: { isPrimary: "desc" } });
    if (!contact?.phone) {
      out.noContact++;
      continue;
    }
    const balance = inv.totalPaise - inv.payments.reduce((a, p) => a + p.amountPaise, 0);
    const res = await queueSafely({
      consultancyId: inv.consultancyId,
      plan: inv.consultancy.plan,
      clientId: inv.clientId,
      channel: "WHATSAPP",
      to: contact.phone,
      template: bucket.kind === "overdue" ? "invoice_overdue" : "invoice_reminder",
      payload: { consultancy: inv.consultancy.name, invoice: inv.number, amount: formatRupees(balance), dueDate: formatDate(inv.dueDate) },
      dedupeKey: `invoice:${inv.id}:${bucket.key}`,
    }, now);
    if (res === "queued") {
      out.queued++;
      await db.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: now } });
    } else if (res === "duplicate") out.duplicate++;
    else out.skipped++;
  }
  return out;
}
