import { ResumePreview } from "@/components/resume-preview";
import { canViewCandidatePacket } from "@/lib/candidate-packets";
import { normalizeCvContent } from "@/lib/resume";
import type { CandidatePacketData } from "@/lib/candidate-packets";

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DetailGrid({ values }: { values: Array<[string, unknown]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {values.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-800 bg-slate-950/70 p-3 shadow-inner">
          <dt className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
          <dd className="mt-1 break-words text-xs font-medium text-slate-100">{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ObjectDetails({ title, value }: { title: string; value: object }) {
  const entries = Object.entries(value ?? {});
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      <DetailGrid values={entries.map(([key, item]) => [key.replaceAll("_", " "), item])} />
    </section>
  );
}

export function CandidatePacket({ packet }: { packet: CandidatePacketData }) {
  const { applicant, student, cvDocument } = packet;
  const content = cvDocument ? normalizeCvContent(cvDocument.content) : null;
  const isUnmasked = canViewCandidatePacket(applicant.status);

  return (
    <article className="candidate-packet space-y-6">
      <section className="candidate-profile-sheet rounded-lg border border-slate-750 bg-slate-900/90 p-5 shadow-md">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-400">
              Verified Candidate Dossier
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-white">{student.name}</h2>
            <p className="font-mono text-xs text-slate-400">{student.roll_no}</p>
          </div>
          <span className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 font-mono text-xs capitalize text-slate-200">
            {applicant.status.replaceAll("_", " ")}
          </span>
        </div>

        {!isUnmasked && (
          <div className="mb-5 flex items-center gap-2 rounded-md border border-amber-800/80 bg-amber-950/60 px-3.5 py-2.5 text-xs text-amber-200 shadow-sm">
            <span className="font-mono font-bold uppercase text-[10px] bg-amber-900/80 px-1.5 py-0.5 rounded border border-amber-700/80">Privacy Mask</span>
            <span>Pre-shortlist candidate packet: phone, personal email, gender, and CV contact fields are securely masked.</span>
          </div>
        )}

        <div className="space-y-5">
          <DetailGrid
            values={[
              ["Phone", student.phone],
              ["Personal email", student.personal_email],
              ["Gender", student.gender],
              ["Section", student.section],
              ["Age", student.age],
              ["Work experience", `${student.total_work_ex_months} months`],
              ["Placement status", student.placement_status],
              ["Applied", new Date(applicant.applied_at).toLocaleString()],
            ]}
          />

          <ObjectDetails title="Postgraduate Academic Record" value={student.pg_details ?? {}} />
          <ObjectDetails title="Graduation Degree Details" value={student.graduation_details ?? {}} />
          <ObjectDetails title="Secondary & Higher Secondary (10th/12th)" value={student.tenth_twelfth_details ?? {}} />

          {student.prior_employers.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Prior Professional Experience</h3>
              <div className="space-y-2">
                {student.prior_employers.map((employer, index) => (
                  <div key={`${employer.company}-${index}`} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                    <strong className="text-white font-semibold">{employer.company}</strong>
                    {employer.role ? ` — ${employer.role}` : ""}
                    {employer.duration_months ? ` · ${employer.duration_months} months` : ""}
                  </div>
                ))}
              </div>
            </section>
          )}

          <DetailGrid
            values={[
              ["Other qualifications", student.other_qualifications],
              [
                "Credentials",
                student.credentials.length
                  ? student.credentials.map((credential) => displayValue(credential)).join("; ")
                  : null,
              ],
            ]}
          />
        </div>
      </section>

      {content ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 print:hidden">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Attached Application CV</h3>
            <p className="font-mono text-[11px] text-slate-400">
              Version {cvDocument?.version_no} · template {cvDocument?.template_id}
            </p>
          </div>
          <ResumePreview content={content} templateId={cvDocument?.template_id} />
        </section>
      ) : (
        <div className="rounded-md border border-amber-800/80 bg-amber-950/50 p-4 text-xs text-amber-300">
          This application has no attached CV snapshot.
        </div>
      )}
    </article>
  );
}
