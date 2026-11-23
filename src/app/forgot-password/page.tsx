import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo, Wordmark } from "@/components/topnav";
import { requestPasswordReset } from "../actions-auth";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><Wordmark className="text-xl" /></div>
        <h1 className="h-display mt-4">Reset your password</h1>
        <p className="dim mb-6 mt-1 text-sm">Enter your work email and we will send you a link to choose a new password.</p>
        <AuthForm
          action={requestPasswordReset}
          submit="Send reset link"
          fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@consultancy.in" }]}
          alt={{ text: "Remembered it?", href: "/login", label: "Sign in" }}
        />
      </div>
    </main>
  );
}
