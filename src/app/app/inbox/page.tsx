import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/context";
import { renderInApp } from "@/lib/inapp";
import { Badge, Card, Empty, Field, PageHeader, fmtDate } from "@/components/ui";
import { markAllRead, saveWhatsAppNumber } from "./actions";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const ctx = await requireStaff();
  const { error, saved } = await searchParams;
  const [items, me] = await Promise.all([
    db.notification.findMany({ where: { channel: "IN_APP", to: ctx.userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { phone: true } }),
  ]);
  const unread = items.filter((i) => !i.readAt).length;

  return (
    <>
      <PageHeader eyebrow="Inbox" title={unread ? `${unread} new` : "You're up to date"}>
        {unread > 0 && <form action={markAllRead}><button className="btn btn-sm" type="submit">Mark all read</button></form>}
      </PageHeader>
      <Card className="mb-5">
        <form action={saveWhatsAppNumber} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Get these alerts on WhatsApp too" hint={me.phone ? "Deadline alerts are also sent to this number between 9 am and 8 pm IST. Reply STOP to a message to opt out." : "Add your mobile number to receive deadline alerts on WhatsApp. Leave blank to use the inbox only."}>
              <input className="input" name="phone" inputMode="tel" placeholder="98765 43210" defaultValue={me.phone ? me.phone.replace(/^91/, "") : ""} />
            </Field>
          </div>
          <button className="btn btn-sm" type="submit">Save number</button>
        </form>
        {error && <p role="alert" className="badge b-rose mt-3" style={{ textTransform: "none" }}>{error}</p>}
        {saved && <p className="badge b-mint mt-3" style={{ textTransform: "none" }}>Saved</p>}
      </Card>
      {items.length === 0 ? <Empty title="Nothing here yet" hint="Deadline alerts and client activity show up here." /> : (
        <Card className="!p-2">
          <ul>
            {items.map((n) => {
              const v = renderInApp(n.template, n.payload);
              const body = (
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.readAt && <Badge tone="pink">New</Badge>}
                      <span className="font-semibold">{v.title}</span>
                    </div>
                    {v.body && <p className="dim text-sm">{v.body}</p>}
                  </div>
                  <span className="faint shrink-0 text-xs">{fmtDate(n.createdAt)}</span>
                </div>
              );
              return (
                <li key={n.id} className="border-t first:border-t-0" style={{ borderColor: "var(--glass-border)" }}>
                  {v.href ? <Link href={v.href} className="block rounded-xl hover:bg-white/5">{body}</Link> : body}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
