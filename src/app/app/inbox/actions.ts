"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/context";
import { toWhatsAppNumber } from "@/lib/whatsapp/phone";

export async function markAllRead(): Promise<void> {
  const ctx = await requireStaff();
  await db.notification.updateMany({ where: { channel: "IN_APP", to: ctx.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/app", "layout");
}

/** Lets a team member receive their deadline alerts on WhatsApp too. Empty clears the number. */
export async function saveWhatsAppNumber(form: FormData): Promise<void> {
  const ctx = await requireStaff();
  const raw = String(form.get("phone") ?? "").trim();
  if (raw === "") {
    await db.user.update({ where: { id: ctx.userId }, data: { phone: null } });
  } else {
    const normalised = toWhatsAppNumber(raw);
    if (!normalised) redirect(`/app/inbox?error=${encodeURIComponent("That does not look like an Indian mobile number")}`);
    await db.user.update({ where: { id: ctx.userId }, data: { phone: normalised } });
  }
  revalidatePath("/app/inbox");
  redirect("/app/inbox?saved=1");
}
