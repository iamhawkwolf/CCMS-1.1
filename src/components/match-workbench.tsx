"use client";
import { useRef, useState } from "react";
import { Badge, Field, Meter, Pill, type Tone } from "@/components/ui";

const MAX_FILES = 20;
const MAX_BYTES = 5 * 1024 * 1024;

interface Component { key: string; label: string; score: number; weight: number; detail: string }
interface Result {
  file: string;
  candidate: { name: string | null; email: string | null; phone: string | null; currentCompany: string | null; currentTitle: string | null; experienceYears: number | null };
  match: { score: number; band: "Strong" | "Good" | "Partial" | "Weak"; rulesScore: number; aiScore: number | null; method: string; breakdown: Component[]; matchedSkills: string[]; missingSkills: string[]; transferable: string[]; summary: string | null; warnings: string[] };
}
interface Response { results: Result[]; failed: Array<{ name: string; error: string }> }

const bandTone: Record<Result["match"]["band"], Tone> = { Strong: "green", Good: "blue", Partial: "dim", Weak: "red" };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Upload resumes, rank them against this requisition's JD, and submit any candidate straight from the result.
 * `submitAction` is the existing submitProfile server action, so duplicate checks and client notification still apply.
 */
export function MatchWorkbench({ requisitionId, submitAction, aiMode }: { requisitionId: string; submitAction: (form: FormData) => Promise<void>; aiMode: "rules" | "ollama" | "claude" }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Response | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | File[]) {
    const incoming = [...list];
    const bad = incoming.filter((f) => !/\.(pdf|docx)$/i.test(f.name) || f.size > MAX_BYTES);
    const ok = incoming.filter((f) => !bad.includes(f));
    const merged = [...files, ...ok.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))].slice(0, MAX_FILES);
    setFiles(merged);
    setError(bad.length ? `Skipped ${bad.map((f) => f.name).join(", ")}: only PDF or .docx up to 5 MB.` : ok.length + files.length > MAX_FILES ? `Only ${MAX_FILES} resumes at a time.` : null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const body = new FormData();
      body.set("requisitionId", requisitionId);
      for (const f of files) body.append("file", f);
      const res = await fetch("/api/resumes/match", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Something went wrong (${res.status}).`);
      setData(json as Response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div
        className={`glass-flat grid place-items-center gap-2 border-2 border-dashed px-6 py-10 text-center ${over ? "!border-[var(--blue)]" : ""}`}
        style={{ borderColor: over ? "var(--blue)" : "var(--line-strong)" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <div className="h-section">Drop resumes here</div>
        <p className="dim text-sm">PDF or Word (.docx), up to 5 MB each, {MAX_FILES} at a time. Scanned images are not read yet.</p>
        <input ref={input} type="file" multiple accept=".pdf,.docx" className="sr-only" id="resume-files" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        <label htmlFor="resume-files" className="btn btn-sm cursor-pointer">Choose files</label>
      </div>

      {files.length > 0 && (
        <div>
          <ul className="grid gap-1 text-sm">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex items-center justify-between gap-3">
                <span className="truncate">{f.name} <span className="faint">{kb(f.size)}</span></span>
                <button type="button" className="btn btn-sm" onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${f.name}`}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>{busy ? "Reading and ranking…" : `Rank ${files.length} resume${files.length > 1 ? "s" : ""} against the JD`}</button>
            {!busy && <button type="button" className="btn" onClick={() => { setFiles([]); setData(null); setError(null); }}>Clear</button>}
            <span className="faint text-xs">{aiMode === "rules" ? "Scored by rules: instant." : `AI-assisted: rules rank all, then the AI re-judges the top 10. This can take a few minutes.`}</span>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {error && <p role="alert" className="badge b-red" style={{ textTransform: "none" }}>{error}</p>}
      </div>

      {data && (
        <div className="grid gap-3">
          <h2 className="h-section">Ranked ({data.results.length})</h2>
          {data.results.map((r, i) => (
            <article key={r.file + i} className="glass-flat p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="faint text-sm">#{i + 1}</span>
                    <span className="font-semibold">{r.candidate.name ?? "Name not found"}</span>
                    <Pill tone={bandTone[r.match.band]}>{r.match.band}</Pill>
                  </div>
                  <div className="faint text-xs">{[r.candidate.currentTitle, r.candidate.currentCompany, r.candidate.experienceYears != null ? `${r.candidate.experienceYears} yrs` : null].filter(Boolean).join(" · ") || r.file}</div>
                </div>
                <div className="w-48 max-w-full"><Meter label="Match" value={r.match.score} tone={bandTone[r.match.band]} /></div>
              </div>

              {r.match.summary && <p className="dim mt-3 text-sm">{r.match.summary}</p>}

              {(r.match.matchedSkills.length > 0 || r.match.missingSkills.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.match.matchedSkills.map((s) => <Badge key={`m-${s}`} tone="green">{s}</Badge>)}
                  {r.match.missingSkills.map((s) => <Badge key={`x-${s}`} tone="red">missing: {s}</Badge>)}
                </div>
              )}
              {r.match.transferable.length > 0 && <p className="dim mt-2 text-sm"><strong>Transferable:</strong> {r.match.transferable.join("; ")}</p>}
              {r.match.warnings.map((w) => <p key={w} className="faint mt-2 text-xs">⚠ {w}</p>)}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">How this score was made</summary>
                <ul className="dim mt-2 grid gap-1 text-sm">
                  {r.match.breakdown.map((c) => <li key={c.key}>{c.label} <span className="faint">(weight {c.weight})</span>: {Math.round(c.score * 100)}% <span className="faint">· {c.detail}</span></li>)}
                  <li className="faint text-xs">Rules score {r.match.rulesScore}{r.match.aiScore != null ? `, AI score ${r.match.aiScore}, blended 40/60` : ""}. Scored by {r.match.method}.</li>
                </ul>
              </details>

              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold">Submit this candidate to the client</summary>
                <p className="dim mt-2 text-xs">Filled from the resume. Check every field before submitting.</p>
                <form action={submitAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><input className="input" name="name" required defaultValue={r.candidate.name ?? ""} /></Field>
                  <Field label="Current company"><input className="input" name="currentCompany" defaultValue={r.candidate.currentCompany ?? ""} /></Field>
                  <Field label="Phone"><input className="input" name="phone" inputMode="tel" defaultValue={r.candidate.phone ?? ""} /></Field>
                  <Field label="Email"><input className="input" name="email" type="email" defaultValue={r.candidate.email ?? ""} /></Field>
                  <Field label="Experience (years)"><input className="input" name="experienceYears" type="number" step="0.5" min={0} defaultValue={r.candidate.experienceYears ?? ""} /></Field>
                  <Field label="Notice period (days)"><input className="input" name="noticeDays" type="number" min={0} /></Field>
                  <div className="flex items-end"><button className="btn btn-primary" type="submit">Submit to client</button></div>
                </form>
              </details>
            </article>
          ))}
          {data.failed.length > 0 && (
            <div className="glass-flat p-4 text-sm">
              <div className="font-semibold">Could not read {data.failed.length} file{data.failed.length > 1 ? "s" : ""}</div>
              <ul className="dim mt-1 grid gap-1">{data.failed.map((f) => <li key={f.name}>{f.name}: {f.error}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
