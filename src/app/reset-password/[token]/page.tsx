import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Logo, Wordmark } from "@/components/topnav";
import { resetTokenValid } from "@/lib/auth/password-reset";
import { resetPassword } from "../../actions-auth";

// The token is in the address, so keep it out of Referer headers and search results.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await resetTokenValid(token);
  return (
    <main className="frame grid place-items-center">
      <div className="glass w-full max-w-md p-8">
        <div className="flex items-center gap-3"><Logo /><Wordmark className="text-xl" /></div>
        {valid ? (
          <>
            <h1 className="h-display mt-4">Choose a new password</h1>
            <p className="dim mb-6 mt-1 text-sm">At least 8 characters. You will be signed out everywhere else.</p>
            <AuthForm
              action={resetPassword.bind(null, token)}
              submit="Change password"
              fields={[
                { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
                { name: "confirm", label: "Repeat it", type: "password", autoComplete: "new-password" },
              ]}
            />
          </>
        ) : (
          <>
            <h1 className="h-display mt-4">This link no longer works</h1>
            <p className="dim mb-6 mt-1 text-sm">Reset links work once and expire after an hour. Ask for a new one.</p>
            <Link href="/forgot-password" className="btn btn-primary">Send a new link</Link>
          </>
        )}
      </div>
    </main>
  );
}
