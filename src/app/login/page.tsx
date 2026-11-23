import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo, Wordmark } from "@/components/topnav";
import { login } from "../actions-auth";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><Wordmark className="text-xl" /></div>
        <h1 className="h-display mt-4">Welcome back</h1>
        <p className="dim mb-6 mt-1 text-sm">One login for every client company you run.</p>
        <AuthForm
          action={login}
          submit="Sign in"
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@consultancy.in" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
          alt={{ text: "New here?", href: "/signup", label: "Create your consultancy" }}
        />
      </div>
    </main>
  );
}
