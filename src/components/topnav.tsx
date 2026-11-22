"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string }

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size * 2.1} height={size} viewBox="0 0 63 30" aria-hidden>
      <polygon points="0,30 14,0 28,0 14,30" fill="var(--blue)" />
      <polygon points="17,30 31,0 45,0 31,30" fill="var(--blue)" />
      <polygon points="34,30 48,0 62,0 48,30" fill="var(--blue-pale)" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function TopNav({ items, brand, initials, who, unread, showSettings, signOut }: { items: NavItem[]; brand: string; initials: string; who: string; unread: number; showSettings: boolean; signOut: () => Promise<void> }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <header className="topbar">
      <Link href="/app" className="flex items-center gap-3" aria-label="CCMS home">
        <Logo />
        <span className="leading-tight">
          <span className="block text-[.95rem] font-semibold tracking-tight">CCMS</span>
          <span className="faint block max-w-40 truncate text-[.7rem]">{brand}</span>
        </span>
      </Link>

      <nav className="tabs" aria-label="Main">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="tab" aria-current={active(i.href) ? "page" : undefined}>{i.label}</Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Link href="/app/inbox" className="icon-btn" aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"} aria-current={path.startsWith("/app/inbox") ? "page" : undefined}>
          <svg viewBox="0 0 24 24" {...stroke} aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          {unread > 0 && <span className="dot-count" aria-hidden>{unread > 9 ? "9+" : unread}</span>}
        </Link>
        {showSettings && (
          <Link href="/app/settings" className="icon-btn" aria-label="Settings" aria-current={path.startsWith("/app/settings") ? "page" : undefined}>
            <svg viewBox="0 0 24 24" {...stroke} aria-hidden><path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
          </Link>
        )}
        <span className="avatar" title={who} aria-label={who}>{initials}</span>
        <form action={signOut}><button className="btn btn-sm" type="submit">Sign out</button></form>
      </div>
    </header>
  );
}
