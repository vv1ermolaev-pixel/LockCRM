import { sql } from "drizzle-orm";

import { db } from "@/db";

// Checked on every request: never prerender or cache the health status
export const dynamic = "force-dynamic";

// Smoke check for deploys: 200 only when the app is up and the database answers
export async function GET() {
  const version = process.env.APP_VERSION ?? "dev";
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", version });
  } catch (error) {
    console.error("Health check failed: database is unreachable", error);
    return Response.json({ status: "error", version }, { status: 503 });
  }
}
