import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/topnav";
import { DEMO_LOGINS, demoModeOn, signupOpen } from "@/lib/demo/mode";
import { demoLogin } from "../actions-demo";
import { login } from "../actions-auth";

export const metadata: Metadata = { title: "Sign in" };
// The first demo click builds the sample data, which can take several seconds on a hosted database.
export const maxDuration = 60;

export default function LoginPage() {
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><span className="text-xl font-semibold tracking-tight">CCMS</span></div>
        <h1 className="h-display mt-4">Welcome back</h1>
        <p className="dim mb-6 mt-1 text-sm">One login for every client company you run.</p>
        <AuthForm
          action={login}
          submit="Sign in"
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@consultancy.in" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
          alt={signupOpen() ? { text: "New here?", href: "/signup", label: "Create your consultancy" } : undefined}
        />
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
