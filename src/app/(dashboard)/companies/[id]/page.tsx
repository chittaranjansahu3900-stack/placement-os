import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { outreachTemplate, renderOutreachTemplate } from "@/lib/outreach-templates";
import { uploadVaultFile } from "@/app/actions/files";
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

// Section 4.8 — Company detail: pipeline stage, Owner (JPC)/Supervisor
// (Senior SPC), JD Form Received flag, contact directory, and the outreach
// log (call remarks, SPC remarks, persona-composed email touchpoints).
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
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">{typedCompany.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">{typedCompany.sector ?? "No sector set"}</p>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md border border-blue-900 bg-blue-950 px-3 py-2 text-sm text-blue-200">
          {notice}
        </p>
      )}

      {/* Stage, owner/supervisor, JD form flag */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-sm text-neutral-300">Pipeline stage</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <form key={s} action={updateCompanyStage.bind(null, id, s)}>
                <button
                  type="submit"
                  disabled={typedCompany.pipeline_stage === s}
                  className="rounded-md border border-neutral-700 px-2 py-1 text-xs capitalize text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
                >
                  {s}
                </button>
              </form>
            ))}
          </div>

          <form
            action={toggleJdFormReceived.bind(null, id)}
            className="mt-4 flex items-center gap-2"
          >
            <input
              id="jd_form_received"
              name="jd_form_received"
              type="checkbox"
              defaultChecked={typedCompany.jd_form_received}
            />
            <label htmlFor="jd_form_received" className="text-sm text-neutral-300">
              JD Form Received
            </label>
            <button
              type="submit"
              className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
            >
              Save
            </button>
          </form>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
            Supervisory line: <span className="text-neutral-200">{assignedOwner?.name ?? "Unassigned JPC"}</span>
            {" → "}<span className="text-neutral-200">{assignedSupervisor?.name ?? "Unassigned Senior SPC"}</span>
          </div>
          <form action={assignCompanyPerson.bind(null, id, "owner_user_id")} className="space-y-1">
            <label className="block text-sm text-neutral-300">Owner (JPC)</label>
            <div className="flex gap-2">
              <select
                name="owner_user_id"
                defaultValue={typedCompany.owner_user_id ?? ""}
                className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
              >
                <option value="" disabled>Choose active JPC</option>
                {ownerRows.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Set
              </button>
            </div>
          </form>

          <form
            action={assignCompanyPerson.bind(null, id, "supervisor_user_id")}
            className="space-y-1"
          >
            <label className="block text-sm text-neutral-300">Supervisor (Senior SPC)</label>
            <div className="flex gap-2">
              <select
                name="supervisor_user_id"
                defaultValue={typedCompany.supervisor_user_id ?? ""}
                className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
              >
                <option value="" disabled>Choose active Senior SPC</option>
                {supervisorRows.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Set
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Contact directory */}
      <div>
        <h2 className="text-sm font-semibold text-white">Contacts</h2>
        <ul className="mt-2 divide-y divide-neutral-800 text-sm">
          {contactRows.map((c) => (
            <li key={c.id} className="py-2">
              <p className="text-white">
                {[c.title, c.full_name, c.last_name].filter(Boolean).join(" ")} {c.hr_designation && `— ${c.hr_designation}`}
              </p>
              <p className="text-xs text-neutral-500">
                {c.email}{c.cc_email ? ` · cc: ${c.cc_email}` : ""}{c.phone ? ` · ${c.phone}` : ""}
              </p>
            </li>
          ))}
          {contactRows.length === 0 && <p className="py-2 text-neutral-500">No contacts yet.</p>}
        </ul>
        <form action={addCompanyContact.bind(null, id)} className="mt-3 grid grid-cols-2 gap-2">
          <input
            name="title"
            placeholder="Title (Mr/Ms/Dr)"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <input
            name="full_name"
            placeholder="Full name"
            required
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <input
            name="last_name"
            placeholder="Last name"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <input
            name="hr_designation"
            placeholder="Designation"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <input
            name="cc_email"
            type="email"
            placeholder="cc email"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <input
            name="phone"
            placeholder="Phone"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            className="col-span-2 rounded-md border border-neutral-700 px-2 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Add contact
          </button>
        </form>
      </div>

      {/* Persona-based outreach composer */}
      <div>
        <h2 className="text-sm font-semibold text-white">Outreach Composer</h2>
        <p className="mt-1 rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
          Draft wording requires CDPO sign-off. Messages remain blocked while the server-side
          notification kill switch is off.
        </p>
        <p className="hidden">
          No email delivery is wired up yet — this logs the touchpoint, it doesn&apos;t send one.
        </p>
        <form method="get" className="mt-3 flex flex-wrap gap-2">
          <select
            name="persona_id"
            defaultValue={persona_id ?? ""}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          >
            <option value="">Choose a persona…</option>
            {personaRows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.category_name}
              </option>
            ))}
          </select>
          <select
            name="contact_id"
            defaultValue={contact_id ?? ""}
            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-600"
          >
            <option value="">Generic greeting</option>
            {contactRows.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}
          </select>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-2 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Load personalized preview
          </button>
        </form>
        <form action={sendOutreachEmails.bind(null, id)} className="mt-3 space-y-3">
          <input
            name="subject_template"
            defaultValue="Placement partnership with {{company_name}}"
            required
            maxLength={300}
            aria-label="Email subject template"
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          />
          <textarea
            name="message_template"
            rows={6}
            defaultValue={rawTemplate}
            placeholder={
              selectedPersona
                ? undefined
                : "Select a persona above, or write your own message"
            }
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          />
          {composedTemplate && (
            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Preview</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{composedTemplate}</p>
            </div>
          )}
          <fieldset className="rounded-md border border-neutral-800 p-3">
            <legend className="px-1 text-xs text-neutral-400">Recipients (mail merge)</legend>
            <div className="space-y-2">
              {contactRows.filter((contact) => contact.email).map((contact) => (
                <label key={contact.id} className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    name="contact_ids"
                    value={contact.id}
                    defaultChecked={contact.id === contact_id}
                  />
                  {contact.full_name} &lt;{contact.email}&gt;
                </label>
              ))}
              {!contactRows.some((contact) => contact.email) && (
                <p className="text-xs text-neutral-500">Add a contact email before composing outreach.</p>
              )}
            </div>
          </fieldset>
          <label className="block text-xs text-neutral-400">
            Send now, or schedule (local time)
            <input
              type="datetime-local"
              name="scheduled_for"
              className="mt-1 block w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </label>
          <button
            type="submit"
            disabled={!contactRows.some((contact) => contact.email)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Queue outreach
          </button>
        </form>
      </div>

      {/* Call remarks / SPC remarks */}
      <div className="grid grid-cols-2 gap-6">
        <form action={logCallRemark.bind(null, id)} className="space-y-2">
          <label className="block text-sm text-neutral-300">Call Remarks</label>
          <textarea
            name="remark"
            rows={3}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Log Call
          </button>
        </form>
        <form action={addSpcRemark.bind(null, id)} className="space-y-2">
          <label className="block text-sm text-neutral-300">SPC Remarks</label>
          <textarea
            name="remark"
            rows={3}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
          >
            Add Remark
          </button>
        </form>
      </div>

      {/* Plain-file Placement Committee Vault: no redaction/status variants. */}
      <div>
        <h2 className="text-sm font-semibold text-white">Placement Committee Vault</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Original files only. Tenant and committee permissions still apply, but no file is masked by
          shortlist status.
        </p>
        <form action={uploadVaultFile.bind(null, id)} className="mt-3 flex items-center gap-2">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png"
            className="block flex-1 text-xs text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-neutral-200"
          />
          <button className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800">
            Upload
          </button>
        </form>
        <ul className="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800">
          {(vaultFiles ?? []).map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-neutral-200">{file.original_name}</p>
                <p className="text-xs text-neutral-500">
                  {(file.size_bytes / 1024).toFixed(1)} KB · {new Date(file.created_at).toLocaleString()}
                </p>
              </div>
              <a
                href={`/api/files/download?path=${encodeURIComponent(file.file_path)}&name=${encodeURIComponent(file.original_name)}`}
                className="text-xs text-blue-400 hover:underline"
              >
                Download
              </a>
            </li>
          ))}
          {(vaultFiles ?? []).length === 0 && (
            <li className="p-3 text-sm text-neutral-500">No vault files yet.</li>
          )}
        </ul>
      </div>

      {/* Activity feed */}
      <div>
        <h2 className="text-sm font-semibold text-white">Activity</h2>
        <ul className="mt-3 space-y-3">
          {activityRows.map((a) => {
            const job = jobByActivity.get(a.id);
            return (
            <li key={a.id} className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {new Date(a.occurred_at).toLocaleString()} · {a.logged_by_name ?? "Unknown"}
                </span>
                <span className="uppercase">{a.channel}</span>
              </div>
              {a.call_remarks && <p className="mt-1 text-neutral-200">Call: {a.call_remarks}</p>}
              {a.spc_remarks && <p className="mt-1 text-neutral-200">SPC: {a.spc_remarks}</p>}
              {a.previous_mails_summary && (
                <p className="mt-1 whitespace-pre-wrap text-neutral-200">
                  {a.previous_mails_summary}
                </p>
              )}
              {job && (
                <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
                  Delivery: <span className="font-medium text-neutral-200">{job.status}</span>
                  {` · scheduled ${new Date(job.scheduled_for).toLocaleString()} · attempts ${job.attempt_count}`}
                  {job.last_error && <p className="mt-1 text-red-300">{job.last_error}</p>}
                </div>
              )}
              {a.channel === "email" && (
                <form
                  action={updateOutreachStatus.bind(null, id, a.id)}
                  className="mt-2 flex items-center gap-2"
                >
                  <select
                    name="merge_status"
                    defaultValue={a.merge_status ?? ""}
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-600"
                  >
                    {MERGE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                  >
                    Update
                  </button>
                </form>
              )}
              {job && ["blocked", "failed"].includes(job.status) && (
                <form action={retryOutreachNotification.bind(null, id, job.id)} className="mt-2">
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                  >
                    Retry delivery
                  </button>
                </form>
              )}
              {job && ["blocked", "queued", "scheduled", "failed"].includes(job.status) && (
                <form action={rescheduleOutreachNotification.bind(null, id, job.id)} className="mt-2 flex gap-2">
                  <input
                    type="datetime-local"
                    name="scheduled_for"
                    required
                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                  >
                    Reschedule
                  </button>
                </form>
              )}
            </li>
          )})}
          {activityRows.length === 0 && (
            <p className="text-sm text-neutral-500">No activity logged yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
