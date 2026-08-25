import Link from "next/link";
import { redirect } from "next/navigation";
import { OpsIcon } from "@/components/shared/ops-icon";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewDeliverability } from "@/lib/notifications/deliverability-access";
import { getAuthorizedNotificationDeliverabilityReport } from "@/lib/notifications/deliverability-server";

const PERIODS = [7, 30, 90] as const;

function percentage(value: number | null, digits = 2): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function statusClasses(status: string): string {
  if (status === "pass" || status === "healthy") {
    return "border-emerald-800 bg-emerald-950/60 text-emerald-300";
  }
  if (status === "warning" || status === "unconfigured" || status === "insufficient_data") {
    return "border-amber-800 bg-amber-950/60 text-amber-300";
  }
  return "border-red-800 bg-red-950/60 text-red-300";
}

export default async function DeliverabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  if (!canViewDeliverability({ status: ctx.appUser.status, permissionNames: ctx.permissionNames })) {
    redirect("/dashboard");
  }

  const requestedDays = Number((await searchParams).days ?? 30);
  const days = PERIODS.includes(requestedDays as (typeof PERIODS)[number]) ? requestedDays : 30;

  let report: Awaited<ReturnType<typeof getAuthorizedNotificationDeliverabilityReport>> | null = null;
  let reportError: string | null = null;
  try {
    report = await getAuthorizedNotificationDeliverabilityReport({
      instituteId: ctx.appUser.institute_id,
      status: ctx.appUser.status,
      permissionNames: ctx.permissionNames,
    }, days);
  } catch (error) {
    reportError = error instanceof Error ? error.message : "Deliverability monitoring is temporarily unavailable";
  }

  const metrics = report?.trend.summary;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-blue-400">
            <OpsIcon name="mail" size={14} />
            <span>Sending-domain operations</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Email Deliverability</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Read-only SPF, DKIM, DMARC, bounce, complaint, delay, and delivery monitoring. No recipient or message content is exposed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {PERIODS.map((period) => (
            <Link
              key={period}
              href={`/admin/deliverability?days=${period}`}
              aria-current={days === period ? "page" : undefined}
              className={days === period ? "ops-button-primary text-xs" : "ops-button-secondary text-xs"}
            >
              {period} days
            </Link>
          ))}
        </div>
      </div>

      {reportError && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">
          <div className="flex items-center gap-2 font-semibold">
            <OpsIcon name="alert-triangle" size={16} />
            Monitoring could not be loaded
          </div>
          <p className="mt-2 font-mono text-xs text-red-300">{reportError}</p>
          <p className="mt-2 text-xs text-slate-300">
            Check the server-only Resend sending-domain settings and database connectivity. No secret values are displayed here.
          </p>
        </div>
      )}

      {report && metrics && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Delivery summary">
            {[
              ["Provider attempts", metrics.attempted.toLocaleString(), `${days}-day sample`],
              ["Delivery rate", percentage(metrics.deliveryRate), `${metrics.delivered} delivered`],
              ["Bounce rate", percentage(metrics.bounceRate), `${metrics.bounced} bounced`],
              ["Complaint rate", percentage(metrics.complaintRate, 3), `${metrics.complained} complained`],
              ["Pipeline failures", metrics.failed.toLocaleString(), `${metrics.delayed} delayed`],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{detail}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_1.9fr]">
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Sender health</h2>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{report.authentication.domain}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase ${statusClasses(report.health.status)}`}>
                  {report.health.status.replaceAll("_", " ")}
                </span>
              </div>

              <div className="space-y-2">
                {report.health.reasons.map((reason) => (
                  <p key={reason} className="flex gap-2 text-xs leading-5 text-slate-300">
                    <OpsIcon name="check-shield" size={14} className="mt-0.5 shrink-0 text-blue-400" />
                    <span>{reason}</span>
                  </p>
                ))}
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[11px] leading-5 text-slate-400">
                Samples below {report.health.thresholds.minimumAttempts} provider attempts are labelled insufficient data. Gmail complaint events are not a complete substitute for Google Postmaster spam-rate data.
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Domain authentication</h2>
                  <p className="mt-1 text-xs text-slate-400">Public DNS checks are reported independently.</p>
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  Checked {new Date(report.authentication.checkedAt).toLocaleString()}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {report.authentication.checks.map((check) => (
                  <article key={check.kind} className="rounded-md border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-mono text-xs font-bold uppercase text-white">{check.kind}</h3>
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${statusClasses(check.status)}`}>
                        {check.status}
                      </span>
                    </div>
                    <p className="mt-3 break-all font-mono text-[10px] text-slate-400">{check.recordName}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{check.message}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/90 shadow-sm">
            <div className="border-b border-slate-800 p-5">
              <h2 className="text-sm font-bold text-white">Daily provider outcomes</h2>
              <p className="mt-1 text-xs text-slate-400">Aggregate counts only; recipient and provider-message identifiers are excluded.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-950/80 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    {['Date', 'Attempts', 'Delivered', 'Bounced', 'Complaints', 'Delayed', 'Failed'].map((heading) => (
                      <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {report.trend.daily.map((day) => (
                    <tr key={day.date}>
                      <th scope="row" className="px-4 py-3 font-mono font-medium text-white">{day.date}</th>
                      <td className="px-4 py-3">{day.attempted}</td>
                      <td className="px-4 py-3">{day.delivered}</td>
                      <td className="px-4 py-3">{day.bounced}</td>
                      <td className="px-4 py-3">{day.complained}</td>
                      <td className="px-4 py-3">{day.delayed}</td>
                      <td className="px-4 py-3">{day.failed}</td>
                    </tr>
                  ))}
                  {report.trend.daily.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center font-mono text-slate-400">
                        No provider attempts in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
