"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string }

const LEAF = "M24 23.500C15.500 20 15.500 9.500 24 4.500c8.500 5 8.500 15.500 0 19z";
const LEAVES: [number, number, number][] = [[-66, 0.8, 0.7], [66, 0.8, 0.7], [-33, 0.92, 0.86], [33, 0.92, 0.86], [0, 1, 1]];
const ROOTS: [string, number, number][] = [["M24 25C24 31 19.500 33.500 19.500 41", 1.9, 0.95], ["M24 25C21.500 29.500 14.500 30.500 12.500 38.500", 1.5, 0.8]];

/** The Banyanroot mark: a leafy crown over a mirrored root system, on a deep-blue tile. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="br-tile" x1="6" y1="0" x2="42" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#1b3550" /><stop offset="1" stopColor="#07111b" /></linearGradient>
        <radialGradient id="br-glow" cx="24" cy="14" r="24" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#458eec" stopOpacity=".42" /><stop offset="1" stopColor="#458eec" stopOpacity="0" /></radialGradient>
        <linearGradient id="br-leaf" x1="24" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#a9c8f6" /></linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#br-tile)" />
      <rect width="48" height="48" rx="11" fill="url(#br-glow)" />
      <rect x=".5" y=".5" width="47" height="47" rx="10.5" fill="none" stroke="#fff" strokeOpacity=".14" />
      {LEAVES.map(([a, sc, o]) => (
        <path key={a} d={LEAF} fill="url(#br-leaf)" opacity={o} transform={`translate(24 24) rotate(${a}) scale(${sc}) translate(-24 -24)`} />
      ))}
      <g fill="none" stroke="#6fa6f2" strokeLinecap="round">
        <path d="M24 25V42" strokeWidth="2.4" />
        {ROOTS.map(([d, w, o]) => (
          <g key={d}>
            <path d={d} strokeWidth={w} opacity={o} />
            <path d={d} strokeWidth={w} opacity={o} transform="translate(48 0) scale(-1 1)" />
          </g>
        ))}
      </g>
      <circle cx="24" cy="24" r="2.200" fill="#fff" />
    </svg>
  );
}

/** "Banyan" in the ink colour, "root" in brand blue. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-semibold tracking-tight ${className}`}>Banyan<span style={{ color: "var(--blue-ink)" }}>root</span></span>;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function TopNav({ items, brand, initials, who, unread, showSettings, signOut }: { items: NavItem[]; brand: string; initials: string; who: string; unread: number; showSettings: boolean; signOut: () => Promise<void> }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <header className="topbar">
      <Link href="/app" className="flex items-center gap-3" aria-label="Banyanroot home">
        <Logo />
        <span className="leading-tight">
          <Wordmark className="block text-[.95rem]" />
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
