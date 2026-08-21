import { NextResponse } from "next/server";
import {
  applyResendWebhookEvent,
  verifyResendWebhook,
} from "@/lib/notifications/delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 400 });
  }

  try {
    // Signature verification must receive the exact raw request body.
    const payload = await request.text();
    const event = verifyResendWebhook(payload, { id, timestamp, signature });
    const result = await applyResendWebhookEvent(id, event);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Resend webhook rejected", error);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
