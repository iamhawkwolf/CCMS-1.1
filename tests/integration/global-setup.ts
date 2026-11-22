import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export default async function setup() {
  const adminUrl = process.env.ADMIN_DATABASE_URL!;
  const testUrl = process.env.TEST_DATABASE_URL!;
  const dbName = new URL(testUrl).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) throw new Error(`Refusing to run against "${dbName}": the test database name must end in _test`);

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (e) {
    if (!String((e as Error).message).includes("already exists")) throw e;
  } finally {
    await admin.$disconnect();
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: testUrl }, stdio: "pipe" });
}
