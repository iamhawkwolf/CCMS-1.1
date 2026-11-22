"use client";
import { useActionState } from "react";
import Link from "next/link";

export interface AuthField { name: string; label: string; type?: string; autoComplete?: string; placeholder?: string }
export type AuthState = { error?: string; /** Non-secret values to put back after a failed submit (React clears the form otherwise). */ values?: Record<string, string> } | undefined;

export function AuthForm({ action, fields, submit, alt }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; fields: AuthField[]; submit: string; alt: { text: string; href: string; label: string } }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-4">
      {fields.map((f) => (
        <label key={f.name} className="field">
          <span>{f.label}</span>
          <input className="input" name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} placeholder={f.placeholder} defaultValue={state?.values?.[f.name]} required />
        </label>
      ))}
      {state?.error && (
        <p role="alert" className="badge b-rose" style={{ borderRadius: 12, padding: ".6rem .8rem", textTransform: "none", fontSize: ".85rem" }}>
          {state.error}
        </p>
      )}
      <button className="btn btn-primary mt-1" type="submit" disabled={pending}>{pending ? "One moment…" : submit}</button>
      <p className="dim text-center text-sm">
        {alt.text} <Link href={alt.href} className="gradient-text font-semibold">{alt.label}</Link>
      </p>
    </form>
  );
}
