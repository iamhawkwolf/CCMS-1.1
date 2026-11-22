import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/topnav";
import { signup } from "../actions-auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><span className="text-xl font-semibold tracking-tight">CCMS</span></div>
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
