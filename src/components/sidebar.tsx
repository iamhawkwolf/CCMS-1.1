"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; icon: string }

export function Sidebar({ items, brand, user, signOut }: { items: NavItem[]; brand: string; user: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  return (
    <aside className="glass sidebar sticky top-5 flex h-[calc(100vh-2.5rem)] flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <div className="gradient-text text-2xl font-extrabold tracking-tight">CCMS</div>
        <div className="faint truncate text-xs">{brand}</div>
      </div>
      <nav className="nav grid gap-1" aria-label="Main">
        {items.map((i) => {
          const active = i.href === "/app" ? path === "/app" : path.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
              <span aria-hidden className="w-5 text-center">{i.icon}</span>
              {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-2 px-1">
        <div className="faint truncate px-2 text-xs">{user}</div>
        <form action={signOut}>
          <button className="btn btn-sm w-full" type="submit">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
