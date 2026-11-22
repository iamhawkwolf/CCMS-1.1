import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff, visibleClientIds } from "@/lib/auth/context";
import { Badge, Card, DueBadge, Empty, PageHeader, fmtDate } from "@/components/ui";
import { completeTask } from "./actions";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await requireStaff();
  const { show } = await searchParams;
  const ids = await visibleClientIds(ctx);
  const showDone = show === "done";
  const tasks = await db.task.findMany({
    where: { clientId: { in: ids }, status: showDone ? "DONE" : { not: "DONE" } },
    orderBy: showDone ? { completedAt: "desc" } : { dueDate: "asc" },
    take: 100,
    include: { client: { select: { id: true, name: true } }, assignee: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader eyebrow="Tasks" title={showDone ? "Completed" : "Everything pending, earliest first"}>
        <Link className="btn btn-sm" href={showDone ? "/app/tasks" : "/app/tasks?show=done"}>{showDone ? "Show pending" : "Show completed"}</Link>
      </PageHeader>
      {tasks.length === 0 ? <Empty title={showDone ? "Nothing completed yet" : "You're all caught up"} hint="Compliance filings appear here automatically once a client has registrations." /> : (
        <Card className="overflow-x-auto !p-2">
          <table className="table">
            <thead><tr><th>Task</th><th>Client</th><th>Due</th><th>Owner</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.complianceKind && <Badge tone="violet">{t.complianceKind}</Badge>} <span className="ml-1">{t.title}</span></td>
                  <td><Link href={`/app/clients/${t.client.id}`} className="hover:underline">{t.client.name}</Link></td>
                  <td><div>{fmtDate(t.dueDate)}</div><DueBadge due={t.dueDate} done={t.status === "DONE"} /></td>
                  <td className="dim whitespace-nowrap">{t.assignee?.name ?? "Unassigned"}</td>
                  <td>{t.status !== "DONE" && <form action={completeTask.bind(null, t.id)}><button className="btn btn-sm" type="submit">Mark done</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
