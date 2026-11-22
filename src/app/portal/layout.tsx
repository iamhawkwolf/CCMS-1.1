import { db } from "@/lib/db";
import { requireClientUser } from "@/lib/auth/context";
import { signOut } from "../actions-auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClientUser();
  const client = await db.client.findUniqueOrThrow({ where: { id: ctx.clientId }, select: { name: true } });
  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="glass mb-6 flex items-center justify-between gap-3 px-5 py-3">
        <div>
          <span className="gradient-text text-xl font-extrabold">{ctx.consultancyName}</span>
          <span className="faint ml-3 text-sm">for {client.name}</span>
        </div>
        <form action={signOut}><button className="btn btn-sm" type="submit">Sign out</button></form>
      </header>
      {children}
    </div>
  );
}
