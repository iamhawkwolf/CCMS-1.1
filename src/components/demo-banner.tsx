import { resetDemoData } from "@/app/actions-demo";

/** Shown on every page of the demo consultancy. Admins can throw the data away and start again. */
export function DemoBanner({ canReset }: { canReset: boolean }) {
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2 text-sm" style={{ background: "var(--blue-pale)", borderColor: "var(--line-strong)" }}>
      <span><strong>Demo account.</strong> Sample data only. No WhatsApp or email is ever sent from here.</span>
      {canReset && (
        <form action={resetDemoData}>
          <button className="btn btn-sm" type="submit">Reset demo data</button>
        </form>
      )}
    </div>
  );
}
