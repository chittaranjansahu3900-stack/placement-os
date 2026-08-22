import { notFound } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { outreachTemplate, renderOutreachTemplate } from "@/lib/outreach-templates";
import { uploadVaultFile } from "@/app/actions/files";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import {
  updateCompanyStage,
  assignCompanyPerson,
  toggleJdFormReceived,
  addCompanyContact,
  logCallRemark,
  addSpcRemark,
  sendOutreachEmails,
  retryOutreachNotification,
  rescheduleOutreachNotification,
  updateOutreachStatus,
} from "@/app/actions/outreach";
import type {
  Company,
  CompanyContact,
  CompanyTypePersona,
  OutreachActivity,
  PipelineStage,
  MergeStatus,
} from "@/types/domain";
import type { NotificationDatabase } from "@/types/notification-database";

const STAGES: PipelineStage[] = ["prospect", "contacted", "interested", "committed", "onboarded"];
const MERGE_STATUSES: MergeStatus[] = [
  "email_sent",
  "email_opened",
  "email_clicked",
  "responded",
  "not_interested",
  "call_back_later",
  "bounced",
];

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; persona_id?: string; contact_id?: string }>;
}) {
  const { id } = await params;
  const { error, notice, persona_id, contact_id } = await searchParams;
  const [baseClient, ctx] = await Promise.all([createClient(), getCurrentUserContext()]);
  const supabase = baseClient as unknown as SupabaseClient<NotificationDatabase>;

  const { data: company } = await supabase.from("companies").select("*").eq("id", id).single();
  if (!company) notFound();
  const typedCompany = company as Company;

  const [{ data: users }, { data: userRoles }, { data: roles }, { data: contacts }, { data: personas }, { data: activities }] =
    await Promise.all([
      supabase.from("users").select("id, name, status").eq("status", "active").order("name"),
      supabase.from("user_roles").select("user_id, role_id"),
      supabase.from("roles").select("id, name, cloned_from_role_id"),
      supabase.from("company_contacts").select("*").eq("company_id", id).order("full_name"),
      supabase.from("company_type_personas").select("*").order("category_name"),
      supabase
        .from("outreach_activities")
        .select("*")
        .eq("company_id", id)
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

  const roleById = new Map((roles ?? []).map((role) => [role.id, role]));
  const roleNamesByUser = new Map<string, Set<string>>();
  for (const assignment of userRoles ?? []) {
    const names = roleNamesByUser.get(assignment.user_id) ?? new Set<string>();
    let role = roleById.get(assignment.role_id);
    const visited = new Set<string>();
    while (role && !visited.has(role.id)) {
      names.add(role.name);
      visited.add(role.id);
      role = role.cloned_from_role_id ? roleById.get(role.cloned_from_role_id) : undefined;
    }
    roleNamesByUser.set(assignment.user_id, names);
  }
  const userRows = (users ?? []) as { id: string; name: string; status: string }[];
  const ownerRows = userRows.filter((user) => {
    const names = roleNamesByUser.get(user.id);
    return names?.has("BD") || names?.has("JPC");
  });
  const supervisorRows = userRows.filter((user) => {
    const names = roleNamesByUser.get(user.id);
    return names?.has("SPC") || names?.has("Senior SPC");
  });
  const assignedOwner = userRows.find((user) => user.id === typedCompany.owner_user_id);
  const assignedSupervisor = userRows.find((user) => user.id === typedCompany.supervisor_user_id);
  const contactRows = (contacts ?? []) as CompanyContact[];
  const personaRows = (personas ?? []) as CompanyTypePersona[];
  const activityRows = (activities ?? []) as OutreachActivity[];
  const activityIds = activityRows.map((activity) => activity.id);
  const { data: notificationJobs } = activityIds.length
    ? await supabase
        .from("notification_jobs")
        .select("id, outreach_activity_id, status, scheduled_for, attempt_count, last_error")
        .in("outreach_activity_id", activityIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const jobByActivity = new Map(
    (notificationJobs ?? []).map((job) => [job.outreach_activity_id, job]),
  );
  const { data: vaultFiles } = await baseClient
    .from("committee_vault_files")
    .select("id, file_path, original_name, mime_type, size_bytes, created_at")
    .eq("company_id", id)
    .order("created_at", { ascending: false });

  const selectedPersona = personaRows.find((p) => p.id === persona_id);
  const selectedContact = contactRows.find((contact) => contact.id === contact_id);
  const rawTemplate = selectedPersona
    ? outreachTemplate(selectedPersona.category_name, selectedPersona.template_content)
    : "";
  const composedTemplate = rawTemplate
    ? renderOutreachTemplate(rawTemplate, {
        company_name: typedCompany.name,
        contact_title: selectedContact?.title,
        contact_last_name: selectedContact?.last_name || selectedContact?.full_name,
        sender_name: ctx?.appUser.name,
        sender_email: ctx?.appUser.email,
      })
    : "";

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Link href="/companies" className="hover:text-amber-400 flex items-center gap-1 transition-colors">
            <OpsIcon name="building" size={13} />
            <span>Companies Pipeline</span>
          </Link>
          <span>/</span>
          <span className="text-slate-200">{typedCompany.name}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>{typedCompany.name}</span>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-xs text-slate-300 border border-slate-700">
                {typedCompany.sector ?? "General Sector"}
              </span>
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Account ID: <span className="font-mono text-slate-300">{typedCompany.id}</span>
            </p>
          </div>

          <StatusBadge status={typedCompany.pipeline_stage} size="md" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-800/60 bg-blue-950/50 p-3.5 text-xs text-blue-200">
          <OpsIcon name="check" size={16} className="text-blue-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Stage Progression Track & Supervisory Line */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Stage Progression Selector */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
            <OpsIcon name="layers" size={14} className="text-amber-400" />
            <span>Pipeline Progression Stage</span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <form key={s} action={updateCompanyStage.bind(null, id, s)}>
                <button
                  type="submit"
                  disabled={typedCompany.pipeline_stage === s}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all disabled:opacity-40 ${
                    typedCompany.pipeline_stage === s
                      ? "border-amber-600 bg-amber-950 text-amber-300 font-bold"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              </form>
            ))}
          </div>

          <form action={toggleJdFormReceived.bind(null, id)} className="mt-5 flex items-center gap-2.5 pt-4 border-t border-slate-800">
            <input
              id="jd_form_received"
              name="jd_form_received"
              type="checkbox"
              defaultChecked={typedCompany.jd_form_received}
              className="size-4 rounded border-slate-700 bg-slate-950 text-emerald-600 accent-emerald-600"
            />
            <label htmlFor="jd_form_received" className="text-xs font-medium text-slate-200 cursor-pointer">
              Job Description (JD) Form Formally Received
            </label>
            <button
              type="submit"
              className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Update
            </button>
          </form>
        </div>

        {/* Right: Supervisory Ownership Chain */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 backdrop-blur-md">
          <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-3 text-xs font-mono text-slate-400">
            <p className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">Escalation Chain</p>
            <p className="mt-1 text-slate-200">
              <strong className="text-amber-300">{assignedOwner?.name ?? "Unassigned JPC"}</strong> (JPC Owner)
              {" ➔ "}
              <strong className="text-blue-300">{assignedSupervisor?.name ?? "Unassigned Senior SPC"}</strong> (Supervisor)
            </p>
          </div>

          <form action={assignCompanyPerson.bind(null, id, "owner_user_id")} className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">Assign JPC Coordinator</label>
            <div className="flex gap-2">
              <select
                name="owner_user_id"
                defaultValue={typedCompany.owner_user_id ?? ""}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value="" disabled>Select JPC...</option>
                {ownerRows.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">
                Save
              </button>
            </div>
          </form>

          <form action={assignCompanyPerson.bind(null, id, "supervisor_user_id")} className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">Assign Senior SPC Supervisor</label>
            <div className="flex gap-2">
              <select
                name="supervisor_user_id"
                defaultValue={typedCompany.supervisor_user_id ?? ""}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value="" disabled>Select Senior SPC...</option>
                {supervisorRows.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Corporate Contact Directory */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
          <OpsIcon name="users" size={16} className="text-blue-400" />
          <span>Corporate Contact Directory</span>
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {contactRows.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <p className="font-semibold text-white text-xs flex items-center gap-2">
                <span>{[c.title, c.full_name, c.last_name].filter(Boolean).join(" ")}</span>
                {c.hr_designation && (
                  <span className="text-[11px] text-slate-400 font-normal">· {c.hr_designation}</span>
                )}
              </p>
              <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-400">
                {c.email && (
                  <p className="flex items-center gap-1.5 text-blue-300 truncate">
                    <OpsIcon name="mail" size={11} />
                    <span>{c.email}</span>
                  </p>
                )}
                {c.phone && (
                  <p className="flex items-center gap-1.5 text-slate-300">
                    <OpsIcon name="phone" size={11} />
                    <span>{c.phone}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
          {contactRows.length === 0 && (
            <p className="col-span-2 py-4 text-center text-xs text-slate-500 font-mono">No corporate contacts registered yet.</p>
          )}
        </div>

        {/* Add Contact Form */}
        <form action={addCompanyContact.bind(null, id)} className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input name="title" placeholder="Title (Mr/Ms/Dr)" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <input name="full_name" placeholder="Full Name *" required className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <input name="last_name" placeholder="Last Name" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <input name="hr_designation" placeholder="Designation" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <input name="email" type="email" placeholder="Email" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <input name="cc_email" type="email" placeholder="CC Email" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500" />
          <button type="submit" className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors">
            + Add Contact
          </button>
        </form>
      </div>

      {/* Persona-based Outreach Composer */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
          <OpsIcon name="mail" size={16} className="text-purple-400" />
          <span>Persona-Based Outreach Composer</span>
        </h2>
        <div className="mt-2 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-center gap-2">
          <OpsIcon name="shield" size={14} className="text-amber-400 shrink-0" />
          <span>CDPO Policy: All outreach touchpoints are logged and verified before dispatch.</span>
        </div>

        <form method="get" className="mt-4 flex flex-wrap gap-2">
          <select
            name="persona_id"
            defaultValue={persona_id ?? ""}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-purple-500"
          >
            <option value="">Select Company Persona...</option>
            {personaRows.map((p) => (
              <option key={p.id} value={p.id}>{p.category_name}</option>
            ))}
          </select>
          <select
            name="contact_id"
            defaultValue={contact_id ?? ""}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-purple-500"
          >
            <option value="">Personalize for Contact...</option>
            {contactRows.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">
            Generate Template
          </button>
        </form>

        <form action={sendOutreachEmails.bind(null, id)} className="mt-4 space-y-3">
          <input
            name="subject_template"
            defaultValue="Placement partnership with {{company_name}}"
            required
            maxLength={300}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
          />
          <textarea
            name="message_template"
            rows={5}
            defaultValue={rawTemplate}
            placeholder="Select a persona above, or write custom outreach proposition..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-white outline-none focus:border-purple-500"
          />
          {composedTemplate && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300">
              <p className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Live Merged Preview</p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{composedTemplate}</p>
            </div>
          )}
          <fieldset className="border border-slate-700 bg-[#0d1928] p-3">
            <legend className="px-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Recipients · mail merge
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {contactRows.filter((contact) => contact.email).map((contact) => (
                <label key={contact.id} className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    name="contact_ids"
                    value={contact.id}
                    defaultChecked={contact.id === contact_id}
                    className="size-4 accent-blue-500"
                  />
                  <span className="truncate">{contact.full_name} &lt;{contact.email}&gt;</span>
                </label>
              ))}
              {!contactRows.some((contact) => contact.email) && (
                <p className="text-xs text-slate-500">Add a contact email before composing outreach.</p>
              )}
            </div>
          </fieldset>
          <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Send now, or schedule in local time
            <input
              type="datetime-local"
              name="scheduled_for"
              className="ops-input mt-1 block w-full px-3 text-xs sm:max-w-xs"
            />
          </label>
          <button
            type="submit"
            disabled={!contactRows.some((c) => c.email)}
            className="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors"
          >
            Queue Touchpoint
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={logCallRemark.bind(null, id)} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
            <OpsIcon name="phone" size={14} className="text-blue-400" />
            Call remarks
          </label>
          <textarea name="remark" rows={3} required className="ops-input mt-3 w-full p-3 text-xs" />
          <button type="submit" className="ops-button-secondary mt-2">Log call</button>
        </form>
        <form action={addSpcRemark.bind(null, id)} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
            <OpsIcon name="shield" size={14} className="text-amber-400" />
            SPC remarks
          </label>
          <textarea name="remark" rows={3} required className="ops-input mt-3 w-full p-3 text-xs" />
          <button type="submit" className="ops-button-secondary mt-2">Add remark</button>
        </form>
      </div>

      {/* Committee Vault Files */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
          <OpsIcon name="file-text" size={16} className="text-emerald-400" />
          <span>Placement Committee Vault</span>
        </h2>
        <form action={uploadVaultFile.bind(null, id)} className="mt-3 flex items-center gap-2">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png"
            className="block flex-1 text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2.5 file:py-1.5 file:text-xs file:text-slate-200"
          />
          <button className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white">
            Upload Vault File
          </button>
        </form>
        <ul className="mt-3 divide-y divide-slate-800 border border-slate-800 bg-[#0d1928]">
          {(vaultFiles ?? []).map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 p-3 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-200">{file.original_name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                  {(file.size_bytes / 1024).toFixed(1)} KB · {new Date(file.created_at).toLocaleString()}
                </p>
              </div>
              <a
                href={`/api/files/download?path=${encodeURIComponent(file.file_path)}&name=${encodeURIComponent(file.original_name)}`}
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <OpsIcon name="download" size={12} />
                Download
              </a>
            </li>
          ))}
          {(vaultFiles ?? []).length === 0 && (
            <li className="p-3 text-xs text-slate-500">No vault files yet.</li>
          )}
        </ul>
      </div>

      {/* Activity Timeline */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
          <OpsIcon name="clock" size={16} className="text-amber-400" />
          <span>Outreach History &amp; Activity Log</span>
        </h2>
        <div className="mt-4 space-y-3 font-mono text-xs">
          {activityRows.map((a) => {
            const job = jobByActivity.get(a.id);
            return (
              <div key={a.id} className="border border-slate-800 bg-slate-950 p-3.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>{new Date(a.occurred_at).toLocaleString()} · {a.logged_by_name ?? "Coordinator"}</span>
                  <span className="uppercase text-amber-400 font-bold">{a.channel}</span>
                </div>
                {a.call_remarks && <p className="mt-1 text-slate-200 font-sans">Call: {a.call_remarks}</p>}
                {a.spc_remarks && <p className="mt-1 text-slate-200 font-sans">SPC: {a.spc_remarks}</p>}
                {a.previous_mails_summary && (
                  <p className="mt-1 whitespace-pre-wrap text-slate-300 font-sans">{a.previous_mails_summary}</p>
                )}
                {job && (
                  <div className="mt-2 border-l-2 border-blue-500 bg-slate-900 p-2 text-[10px] text-slate-400">
                    Delivery: <span className="font-semibold text-slate-200">{job.status}</span>
                    {` · scheduled ${new Date(job.scheduled_for).toLocaleString()} · attempts ${job.attempt_count}`}
                    {job.last_error && <p className="mt-1 text-red-300">{job.last_error}</p>}
                  </div>
                )}
                {a.channel === "email" && (
                  <form action={updateOutreachStatus.bind(null, id, a.id)} className="mt-2 flex items-center gap-2">
                    <select name="merge_status" defaultValue={a.merge_status ?? ""} className="ops-input px-2 text-[10px]">
                      {MERGE_STATUSES.map((status) => (
                        <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                    <button type="submit" className="ops-button-secondary min-h-9 px-2.5">Update</button>
                  </form>
                )}
                {job && ["blocked", "failed"].includes(job.status) && (
                  <form action={retryOutreachNotification.bind(null, id, job.id)} className="mt-2">
                    <button type="submit" className="ops-button-secondary min-h-9 px-2.5">Retry delivery</button>
                  </form>
                )}
                {job && ["blocked", "queued", "scheduled", "failed"].includes(job.status) && (
                  <form action={rescheduleOutreachNotification.bind(null, id, job.id)} className="mt-2 flex flex-wrap gap-2">
                    <input type="datetime-local" name="scheduled_for" required className="ops-input px-2 text-[10px]" />
                    <button type="submit" className="ops-button-secondary min-h-9 px-2.5">Reschedule</button>
                  </form>
                )}
              </div>
            );
          })}
          {activityRows.length === 0 && <p className="text-slate-500 text-center py-4">No outreach logs recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}
