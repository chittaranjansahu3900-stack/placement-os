import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueNotifications } from "@/lib/notifications/delivery";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.NOTIFICATION_CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await processDueNotifications();
    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("Notification queue processing failed", error);
    return NextResponse.json({ error: "Queue processing failed" }, { status: 500 });
  }
}
