import "server-only";

// DRAFT COPY — CDPO sign-off is required before NOTIFICATIONS_SEND_ENABLED is
// enabled for real recruiter/student recipients.

export interface NotificationTemplate {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paragraph(value: string): string {
  return `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(value)}</p>`;
}

function linkButton(label: string, href?: string): string {
  if (!href) return "";
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block">${escapeHtml(label)}</a></p>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#171717"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:28px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#737373">PlacementOS · iitiimcareers.in</p><h1 style="margin:0 0 24px;font-size:22px">${escapeHtml(title)}</h1>${body}<p style="margin:28px 0 0;font-size:12px;color:#737373">This is an automated PlacementOS notification. Contact the CDPO office if the information appears incorrect.</p></div></div></body></html>`;
}

function salutation(name?: string | null): string {
  return name?.trim() ? `Hello ${name.trim()},` : "Hello,";
}

function appUrl(path: string): string | undefined {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : undefined;
}

export function jdPublishedTemplate(input: {
  recipientName?: string | null;
  companyName: string;
  roleTitle: string;
  deadline: string;
  locations: string[];
  ctcTotal?: number | null;
  jdId: string;
}): NotificationTemplate {
  const subject = `[PlacementOS] New opportunity: ${input.companyName} — ${input.roleTitle}`;
  const details = [
    `Application deadline: ${new Date(input.deadline).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    input.locations.length ? `Location: ${input.locations.join(", ")}` : "Location: As specified in the JD",
    input.ctcTotal != null ? `Total CTC: ${input.ctcTotal} LPA` : null,
  ].filter((value): value is string => Boolean(value));
  const text = [
    salutation(input.recipientName),
    "A new placement opportunity matching your current eligibility profile has been published.",
    `${input.companyName} — ${input.roleTitle}`,
    ...details,
    appUrl(`/jobs`) ? `View opportunity: ${appUrl("/jobs")}` : "Sign in to PlacementOS to review the opportunity.",
    "This wording is pending CDPO approval.",
  ].join("\n\n");
  const html = shell(
    "New placement opportunity",
    paragraph(salutation(input.recipientName)) +
      paragraph("A new placement opportunity matching your current eligibility profile has been published.") +
      `<p style="margin:0 0 16px"><strong>${escapeHtml(input.companyName)} — ${escapeHtml(input.roleTitle)}</strong><br>${details.map(escapeHtml).join("<br>")}</p>` +
      linkButton("View opportunity", appUrl(`/jobs`)),
  );
  return { subject, text, html };
}

export function applicationStatusTemplate(input: {
  recipientName?: string | null;
  companyName: string;
  roleTitle: string;
  status: string;
}): NotificationTemplate {
  const label = input.status.replaceAll("_", " ");
  const subject = `[PlacementOS] Application update: ${input.companyName} — ${input.roleTitle}`;
  const text = [
    salutation(input.recipientName),
    `Your application status for ${input.companyName} — ${input.roleTitle} is now: ${label}.`,
    appUrl("/applications") ? `View your applications: ${appUrl("/applications")}` : "Sign in to PlacementOS for details.",
    "This wording is pending CDPO approval.",
  ].join("\n\n");
  const html = shell(
    "Application status updated",
    paragraph(salutation(input.recipientName)) +
      paragraph(`Your application status for ${input.companyName} — ${input.roleTitle} is now: ${label}.`) +
      linkButton("View applications", appUrl("/applications")),
  );
  return { subject, text, html };
}

export function spcStatusTemplate(input: {
  recipientName?: string | null;
  studentName: string;
  companyName: string;
  roleTitle: string;
  status: string;
  jdId: string;
}): NotificationTemplate {
  const label = input.status.replaceAll("_", " ");
  const subject = `[PlacementOS] Candidate update: ${input.companyName} — ${input.roleTitle}`;
  const text = [
    salutation(input.recipientName),
    `${input.studentName}'s application status is now ${label} for ${input.companyName} — ${input.roleTitle}.`,
    appUrl(`/jds/${input.jdId}/applicants`) ? `Open applicants: ${appUrl(`/jds/${input.jdId}/applicants`)}` : "Sign in to PlacementOS for details.",
    "This wording is pending CDPO approval.",
  ].join("\n\n");
  const html = shell(
    "Candidate status updated",
    paragraph(salutation(input.recipientName)) +
      paragraph(`${input.studentName}'s application status is now ${label} for ${input.companyName} — ${input.roleTitle}.`) +
      linkButton("Open applicants", appUrl(`/jds/${input.jdId}/applicants`)),
  );
  return { subject, text, html };
}

export function roundTemplate(input: {
  recipientName?: string | null;
  companyName: string;
  roleTitle: string;
  round: string;
  scheduledAt?: string | null;
  location?: string | null;
  reminder: boolean;
}): NotificationTemplate {
  const when = input.scheduledAt
    ? new Date(input.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "To be confirmed";
  const title = input.reminder ? "Upcoming placement-round reminder" : "Placement round scheduled";
  const subject = `[PlacementOS] ${input.reminder ? "Reminder: " : ""}${input.round} — ${input.companyName}`;
  const details = [
    `${input.companyName} — ${input.roleTitle}`,
    `Round: ${input.round}`,
    `When: ${when}`,
    `Room/link: ${input.location || "To be confirmed"}`,
  ];
  const text = [
    salutation(input.recipientName),
    title,
    ...details,
    appUrl("/applications") ? `Open PlacementOS: ${appUrl("/applications")}` : "Sign in to PlacementOS for the latest details.",
    "This wording is pending CDPO approval.",
  ].join("\n\n");
  const html = shell(
    title,
    paragraph(salutation(input.recipientName)) +
      `<p style="margin:0 0 16px">${details.map(escapeHtml).join("<br>")}</p>` +
      linkButton("Open PlacementOS", appUrl("/applications")),
  );
  return { subject, text, html };
}

export function outreachTemplate(input: { subject: string; message: string }): NotificationTemplate {
  const subject = input.subject.trim();
  const text = input.message.trim();
  const html = shell(
    subject,
    input.message
      .trim()
      .split(/\n{2,}/)
      .map((part) => paragraph(part.replaceAll("\n", " ")))
      .join(""),
  );
  return { subject, text, html };
}
