import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo, Wordmark } from "@/components/topnav";
import Link from "next/link";
import { signupOpen } from "@/lib/demo/mode";
import { signup } from "../actions-auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  if (!signupOpen()) {
    return (
      <main className="frame grid place-items-center">
        <div className="glass w-full max-w-md p-8">
          <div className="flex items-center gap-3"><Logo /><Wordmark className="text-xl" /></div>
          <h1 className="h-display mt-4">By invitation only</h1>
          <p className="dim mb-6 mt-1 text-sm">New accounts are created for you by your consultancy. Ask them for access.</p>
          <Link href="/login" className="btn btn-primary">Back to sign in</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><Wordmark className="text-xl" /></div>
        <h1 className="h-display mt-4">Start your consultancy</h1>
        <p className="dim mb-6 mt-1 text-sm">Set up in a minute. Add your first client right after.</p>
        <AuthForm
          action={signup}
          submit="Create account"
          fields={[
            { name: "consultancy", label: "Consultancy name", placeholder: "Acme HR Advisors" },
            { name: "name", label: "Your name", autoComplete: "name" },
            { name: "email", label: "Work email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
          ]}
          alt={{ text: "Already have an account?", href: "/login", label: "Sign in" }}
        />
      </div>
    </main>
  );
}
