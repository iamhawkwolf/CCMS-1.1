"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getClientFor, requireStaff } from "@/lib/auth/context";
import { isFeatureOn } from "@/lib/features/server";
import { computeGst, invoiceNumber, lineAmountPaise, rupeesToPaise } from "@/lib/billing/gst";
import { audit } from "@/lib/audit";

const schema = z.object({
  clientId: z.string().min(1),
  feeModel: z.enum(["RETAINER", "FIXED", "HOURLY", "PER_HEAD"]),
  description: z.string().trim().min(2, "Describe what you are billing for"),
  quantity: z.preprocess(Number, z.number().positive("Quantity must be more than 0")),
  rate: z.preprocess(Number, z.number().positive("Rate must be more than 0")),
  dueDays: z.preprocess(Number, z.number().int().min(0).max(120)),
});

export async function createInvoice(form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/app/invoices/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`);
  const d = parsed.data;

  const client = await getClientFor(ctx, d.clientId);
  if (!client || !(await isFeatureOn("invoicing", ctx.consultancyId, ctx.plan, client.id))) redirect("/app/invoices/new?error=Invoicing+is+switched+off+for+that+client");

  const consultancy = await db.consultancy.findUniqueOrThrow({ where: { id: ctx.consultancyId } });
  const supplierState = consultancy.state ?? client.state; // set your state in Settings; until then treat as intra-state
  const amount = lineAmountPaise({ quantity: d.quantity, ratePaise: rupeesToPaise(d.rate) });
  const gst = computeGst(amount, supplierState, client.state);
  const issue = new Date();

  const invoice = await db.$transaction(async (tx) => {
    // Atomic increment: two invoices created at once can never share a number.
    const c = await tx.consultancy.update({ where: { id: ctx.consultancyId }, data: { nextInvoiceNo: { increment: 1 } } });
    return tx.invoice.create({
      data: {
        consultancyId: ctx.consultancyId,
        clientId: client.id,
        number: invoiceNumber(c.invoicePrefix, c.nextInvoiceNo - 1, issue),
        feeModel: d.feeModel,
        issueDate: issue,
        dueDate: new Date(issue.getTime() + d.dueDays * 86400000),
        placeOfSupply: client.state,
        ...gst,
        lines: { create: { description: d.description, quantity: d.quantity, ratePaise: rupeesToPaise(d.rate), amountPaise: amount } },
      },
    });
  });
  await audit(ctx.consultancyId, ctx.userId, "invoice.create", "Invoice", invoice.id);
  redirect(`/app/invoices/${invoice.id}`);
}

async function mine(invoiceId: string) {
  const ctx = await requireStaff();
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, consultancyId: ctx.consultancyId }, include: { payments: true } });
  if (!inv || !(await getClientFor(ctx, inv.clientId))) return null;
  return { ctx, inv };
}

export async function markSent(invoiceId: string): Promise<void> {
  const m = await mine(invoiceId);
  if (!m || m.inv.status !== "DRAFT") return;
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "SENT" } });
  revalidatePath(`/app/invoices/${invoiceId}`);
}

export async function recordPayment(invoiceId: string, form: FormData): Promise<void> {
  const m = await mine(invoiceId);
  if (!m || m.inv.status === "VOID") return;
  const paise = rupeesToPaise(Number(form.get("amount")));
  const paid = m.inv.payments.reduce((a, p) => a + p.amountPaise, 0);
  if (!Number.isFinite(paise) || paise <= 0 || paid + paise > m.inv.totalPaise) redirect(`/app/invoices/${invoiceId}?error=${encodeURIComponent("Enter an amount no more than the balance due")}`);
  const method = ["UPI", "RAZORPAY", "BANK", "CASH"].includes(String(form.get("method"))) ? String(form.get("method")) : "BANK";
  await db.$transaction([
    db.payment.create({ data: { invoiceId, amountPaise: paise, method, reference: String(form.get("reference") ?? "") || null } }),
    db.invoice.update({ where: { id: invoiceId }, data: { status: paid + paise === m.inv.totalPaise ? "PAID" : "PARTIALLY_PAID" } }),
  ]);
  await audit(m.ctx.consultancyId, m.ctx.userId, "invoice.payment", "Invoice", invoiceId, { amountPaise: paise });
  revalidatePath(`/app/invoices/${invoiceId}`);
}
