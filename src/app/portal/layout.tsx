import { db } from "@/lib/db";
import { requireClientUser } from "@/lib/auth/context";
import { Logo } from "@/components/topnav";
import { DemoBanner } from "@/components/demo-banner";
import { signOut } from "../actions-auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClientUser();
  const client = await db.client.findUniqueOrThrow({ where: { id: ctx.clientId }, select: { name: true } });
  return (
    <div className="frame">
      {ctx.isDemo && <DemoBanner canReset={false} />}
      <header className="mb-7 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">{ctx.consultancyName}</span>
            <span className="faint block text-xs">for {client.name}</span>
          </span>
        </div>
        <form action={signOut}><button className="btn btn-sm" type="submit">Sign out</button></form>
      </header>
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}
