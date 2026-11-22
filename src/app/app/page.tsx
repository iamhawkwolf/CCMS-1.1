import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { clientScope, requireStaff } from "@/lib/auth/context";
import { addDays, formatDate, istToday } from "@/lib/time";
import { bucketByDay, bucketByWeek, dayMonthShort, onTimeRate, pctOf, weekStartIST, weekdayShort } from "@/lib/dashboard";
import { BarChart, LineChart } from "@/components/charts";
import { Kpi } from "@/components/kpi";
import { Badge, ButtonLink, Card, DueBadge, Empty, Meter, Pill, fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

type Filter = "all" | "overdue" | "ontrack";
const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
const ArrowIcon = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await requireStaff();
  const { filter: f } = await searchParams;
  const filter: Filter = f === "overdue" || f === "ontrack" ? f : "all";

  const now = new Date();
  const today = istToday(now);
  const horizon = addDays(today, 14);
  const week0 = addDays(weekStartIST(now), -21); // 3 weeks back, this week, 4 ahead = 8 bars
  const since30 = addDays(today, -29);

  const clients = await db.client.findMany({ where: { ...clientScope(ctx), active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, state: true } });
  const ids = clients.map((c) => c.id);

  const [openTasks, weekTasks, filings, profiles, reqs, openReqCount, awaiting, nextBeyond] = await Promise.all([
    db.task.findMany({ where: { clientId: { in: ids }, status: { not: "DONE" }, dueDate: { lt: horizon } }, orderBy: { dueDate: "asc" }, take: 600, select: { id: true, title: true, dueDate: true, clientId: true, complianceKind: true } }),
    db.task.findMany({ where: { clientId: { in: ids }, dueDate: { gte: week0, lt: addDays(week0, 56) } }, select: { dueDate: true, status: true } }),
    db.task.findMany({ where: { clientId: { in: ids }, complianceKind: { not: null }, dueDate: { gte: addDays(today, -60), lt: today } }, select: { clientId: true, dueDate: true, status: true, completedAt: true } }),
    db.profile.findMany({ where: { requisition: { clientId: { in: ids } }, submittedAt: { gte: since30 } }, select: { submittedAt: true, stage: true } }),
    db.requisition.findMany({ where: { clientId: { in: ids }, createdAt: { gte: addDays(today, -14) } }, select: { createdAt: true } }),
    db.requisition.count({ where: { clientId: { in: ids }, status: "OPEN" } }),
    db.profile.count({ where: { stage: "SUBMITTED", requisition: { clientId: { in: ids }, status: "OPEN" } } }),
    db.task.findFirst({ where: { clientId: { in: ids }, status: { not: "DONE" }, dueDate: { gte: horizon } }, orderBy: { dueDate: "asc" }, select: { title: true, dueDate: true, clientId: true } }),
  ]);

  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const overdue = openTasks.filter((t) => t.dueDate < today);
  const upcoming = openTasks.filter((t) => t.dueDate >= today);

  // KPI sparklines: each is a 14-day series for the same thing the number counts.
  const sOverdue = bucketByDay(overdue.map((t) => t.dueDate), addDays(today, -14), 14, "date");
  const sSoon = bucketByDay(upcoming.map((t) => t.dueDate), today, 14, "date");
  const sProfiles = bucketByDay(profiles.map((p) => p.submittedAt), addDays(today, -13), 14, "instant");
  const sReqs = bucketByDay(reqs.map((r) => r.createdAt), addDays(today, -13), 14, "instant");

  // Bottom charts.
  const perWeek = bucketByWeek(weekTasks.map((t) => t.dueDate), week0, 8);
  const doneWeek = bucketByWeek(weekTasks.filter((t) => t.status === "DONE").map((t) => t.dueDate), week0, 8);
  const pastDue = perWeek.slice(0, 3).reduce((a, b) => a + b, 0);
  const pastDone = doneWeek.slice(0, 3).reduce((a, b) => a + b, 0);
  const weekPoints = perWeek.map((value, i) => ({ value, label: dayMonthShort(addDays(week0, i * 7)), detail: `Week of ${dayMonthShort(addDays(week0, i * 7))}` }));
  const daily = bucketByDay(profiles.map((p) => p.submittedAt), since30, 30, "instant");
  const dayPoints = daily.map((value, i) => ({ value, label: dayMonthShort(addDays(since30, i)), detail: `${weekdayShort(addDays(since30, i))} ${dayMonthShort(addDays(since30, i))}` }));
  const reviewed = profiles.filter((p) => p.stage !== "SUBMITTED").length;

  // Client panel.
  const rate = onTimeRate(filings, today, 60);
  const rows = clients.map((c) => {
    const mine = openTasks.filter((t) => t.clientId === c.id);
    const late = mine.filter((t) => t.dueDate < today).length;
    const r = onTimeRate(filings.filter((x) => x.clientId === c.id), today, 60);
    return { ...c, late, tasks: mine.slice(0, 4), pct: r.pct };
  }).sort((a, b) => b.late - a.late || a.name.localeCompare(b.name));
  const shown = rows.filter((r) => (filter === "overdue" ? r.late > 0 : filter === "ontrack" ? r.late === 0 : true));
  const lateClients = rows.filter((r) => r.late > 0).length;

  // The next 14 days as a board.
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const byDay = (d: Date) => upcoming.filter((t) => t.dueDate.getTime() === d.getTime());

  const chip = (label: string, key: Filter, count?: number) => (
    <Link key={key} href={key === "all" ? "/app" : `/app?filter=${key}`} className="chip" aria-current={filter === key ? "true" : undefined}>
      {key !== "all" && <span aria-hidden className="swatch" style={{ background: key === "overdue" ? "var(--red)" : "var(--green)" }} />}
      {label}{count !== undefined && <span className="faint">{count}</span>}
    </Link>
  );

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <h1 className="h-display">{ctx.consultancyName}</h1>
          <div className="eyebrow mt-1">Hello, {ctx.name.split(" ")[0]} · {formatDate(today)}</div>
        </div>
        <div className="flex flex-wrap items-end gap-x-9 gap-y-5">
          <Kpi value={overdue.length} label="Overdue tasks" tone={overdue.length ? "red" : "green"} values={sOverdue} series="Overdue tasks by due date, last 14 days" />
          <Kpi value={upcoming.length} label="Due in 14 days" tone="blue" values={sSoon} series="Tasks due per day, next 14 days" />
          <Kpi value={awaiting} label="Awaiting client" tone="blue" values={sProfiles} series="Profiles submitted per day, last 14 days" />
          <Kpi value={openReqCount} label="Open requisitions" tone="blue" values={sReqs} series="Requisitions raised per day, last 14 days" />
        </div>
      </header>

      {clients.length === 0 ? (
        <Empty title="No clients yet" hint="Add a client company to start tracking its compliance deadlines, requisitions and invoices." action={<ButtonLink href="/app/clients/new" primary>Add your first client</ButtonLink>} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[26rem_1fr]">
          {/* Clients panel */}
          <Card className="content-start xl:max-h-[46rem] xl:overflow-hidden" >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="h-section">Clients</h2>
              <ButtonLink href="/app/clients/new">Add</ButtonLink>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">{chip("All", "all", rows.length)}{chip("Overdue", "overdue", lateClients)}{chip("On track", "ontrack", rows.length - lateClients)}</div>
            <div className="scroll-y grid gap-3 xl:max-h-[35rem]">
              {shown.length === 0 && <p className="dim py-6 text-center text-sm">No clients match this filter.</p>}
              {shown.map((c, idx) => (
                <details key={c.id} className="disclose glass-flat" open={idx === 0 && c.late > 0}>
                  <summary className="flex items-center gap-3 p-3.5">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-sm font-semibold" style={{ background: "var(--pill)" }}>{initials(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="faint flex items-center gap-1.5 text-xs">{c.late ? <Badge tone="red">{c.late} overdue</Badge> : <Badge tone="green">On track</Badge>}<span>{c.state}</span></span>
                    </span>
                    <svg className="chevron faint" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                  </summary>
                  <div className="px-3.5 pb-3.5">
                    {c.pct !== null ? <Meter label="On-time filings, 60 days" value={c.pct} /> : <p className="faint text-xs">No filings were due in the last 60 days.</p>}
                    {c.tasks.length > 0 && (
                      <div className="mt-3 rounded-[12px] p-2" style={{ background: "var(--raised)" }}>
                        <table className="table">
                          <thead><tr><th>Type</th><th>Task</th><th>Due</th></tr></thead>
                          <tbody>
                            {c.tasks.map((t) => (
                              <tr key={t.id}>
                                <td className="!px-2">{t.complianceKind ? <Badge tone="dim">{t.complianceKind}</Badge> : <span className="faint text-xs">Task</span>}</td>
                                <td className="!px-2 text-xs">{t.title.replace(/: \d{4}-\d{2}$/, "")}</td>
                                <td className="!px-2"><DueBadge due={t.dueDate} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <Link href={`/app/clients/${c.id}`} className="accent mt-3 inline-flex items-center gap-1 text-sm font-medium">Open client <ArrowIcon /></Link>
                  </div>
                </details>
              ))}
            </div>
          </Card>

          {/* Next 14 days */}
          <Card className="content-start">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="h-section">Next 14 days</h2>
                <p className="faint text-xs">Deadlines still open, across all your clients</p>
              </div>
              <div className="flex items-center gap-2">
                {overdue.length > 0 ? <Link href="/app/tasks"><Pill tone="red">{overdue.length} overdue, view</Pill></Link> : <Pill tone="green">Nothing overdue</Pill>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {days.map((d, i) => {
                const list = byDay(d);
                const dow = d.getUTCDay();
                return (
                  <div key={i} className="day" data-today={i === 0} data-weekend={dow === 0 || dow === 6}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[1.15rem] font-light leading-none">{d.getUTCDate()}</span>
                      <span className="faint text-[.7rem]">{i === 0 ? "Today" : weekdayShort(d)}</span>
                    </div>
                    {list.slice(0, 3).map((t) => (
                      <Link key={t.id} href={`/app/clients/${t.clientId}`} className="task-chip" title={`${t.title} · ${nameOf.get(t.clientId)}`}>{t.complianceKind ?? "Task"} · {nameOf.get(t.clientId)}</Link>
                    ))}
                    {list.length > 3 && <Link href="/app/tasks" className="faint text-[.7rem]">+{list.length - 3} more</Link>}
                  </div>
                );
              })}
            </div>
            {upcoming.length === 0 && (
              <p className="dim mt-4 text-sm">
                Nothing is due in the next 14 days.
                {nextBeyond && <> The next deadline is <strong>{nextBeyond.title.replace(/: \d{4}-\d{2}$/, "")}</strong> for {nameOf.get(nextBeyond.clientId)} on {fmtDate(nextBeyond.dueDate)}.</>}
              </p>
            )}
          </Card>

          {/* Charts */}
          <div className="grid gap-5 lg:grid-cols-2 xl:col-span-2">
            <Card deep>
              <div className="mb-3 flex items-center justify-between"><h2 className="h-section">Filing workload</h2><Link href="/app/tasks" className="icon-btn" aria-label="Open tasks"><ArrowIcon /></Link></div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-baseline gap-2"><span className="num text-[2.3rem] leading-none">{perWeek[3]}</span><span className="faint text-sm">due this week</span></div>
                {pastDue > 0 ? <div className="w-56"><Meter label="Completed, past 3 weeks" value={pctOf(pastDone, pastDue) ?? 0} /></div> : <span className="faint text-xs">No tasks fell due in the past 3 weeks</span>}
              </div>
              <BarChart points={weekPoints} unit="tasks due" ariaLabel="Tasks due per week: three weeks back, this week, and four weeks ahead" markIndex={3} height={180} />
            </Card>
            <Card deep>
              <div className="mb-3 flex items-center justify-between"><h2 className="h-section">Candidate activity</h2><Link href="/app/requisitions" className="icon-btn" aria-label="Open requisitions"><ArrowIcon /></Link></div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-baseline gap-2"><span className="num text-[2.3rem] leading-none">{profiles.length}</span><span className="faint text-sm">profiles, last 30 days</span></div>
                {profiles.length > 0 ? <div className="w-56"><Meter label="Reviewed by clients" value={pctOf(reviewed, profiles.length) ?? 0} tone="blue" /></div> : <span className="faint text-xs">No profiles submitted yet</span>}
              </div>
              <LineChart points={dayPoints} unit="profiles submitted" ariaLabel="Candidate profiles submitted per day over the last 30 days" height={180} />
            </Card>
          </div>
        </div>
      )}
      <p className="faint mt-6 text-xs">Overall on-time filing rate, last 60 days: {rate.pct === null ? "no filings were due" : `${rate.pct}% (${rate.onTime} of ${rate.total})`}. Dates are shown in India time.</p>
    </>
  );
}
