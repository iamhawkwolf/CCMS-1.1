import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth/context";

export default async function Home() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  redirect(ctx.role === "CLIENT_USER" ? "/portal" : "/app");
}
