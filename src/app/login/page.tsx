import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo, Wordmark } from "@/components/topnav";
import { DEMO_LOGINS, demoModeOn, signupOpen } from "@/lib/demo/mode";
import { demoLogin } from "../actions-demo";
import Link from "next/link";
import { login } from "../actions-auth";

export const metadata: Metadata = { title: "Sign in" };
// The first demo click builds the sample data, which can take several seconds on a hosted database.
export const maxDuration = 60;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><Wordmark className="text-xl" /></div>
        <h1 className="h-display mt-4">Welcome back</h1>
        <p className="dim mb-6 mt-1 text-sm">One login for every client company you run.</p>
        {reset === "1" && <p role="status" className="badge b-green mb-4" style={{ borderRadius: 12, padding: ".6rem .8rem", fontSize: ".85rem" }}>Password changed. Sign in with the new one.</p>}
        <AuthForm
          action={login}
          submit="Sign in"
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@consultancy.in" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
          alt={signupOpen() ? { text: "New here?", href: "/signup", label: "Create your consultancy" } : undefined}
        />
        <p className="mt-3 text-center text-sm"><Link href="/forgot-password" className="accent font-semibold">Forgot your password?</Link></p>
        {demoModeOn() && (
          <section className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }} aria-labelledby="demo-h">
            <h2 id="demo-h" className="h-section">Try the demo</h2>
            <p className="dim mb-3 mt-1 text-sm">Pre-filled sample data. One click, no password. Nothing is sent to anyone.</p>
            <div className="grid gap-2">
              {Object.entries(DEMO_LOGINS).map(([role, d]) => (
                <form key={role} action={demoLogin}>
                  <input type="hidden" name="as" value={role} />
                  <button className="btn w-full justify-between" type="submit"><span className="font-semibold">Explore as {d.label}</span><span className="faint text-xs font-normal">{d.blurb}</span></button>
                </form>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
