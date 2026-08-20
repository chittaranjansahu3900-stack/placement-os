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
        <div key={label} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
          <dd className="mt-1 break-words text-sm text-neutral-200">{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ObjectDetails({ title, value }: { title: string; value: object }) {
  const entries = Object.entries(value ?? {});
  if (entries.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-white">{title}</h3>
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
      <section className="candidate-profile-sheet rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-400">Candidate packet</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{student.name}</h2>
            <p className="text-sm text-neutral-400">{student.roll_no}</p>
          </div>
          <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs capitalize text-neutral-300">
            {applicant.status.replaceAll("_", " ")}
          </span>
        </div>

        {!isUnmasked && (
          <p className="mb-5 rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            Pre-shortlist packet: phone, personal email, gender, and CV contact fields are masked.
          </p>
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

          <ObjectDetails title="Postgraduate details" value={student.pg_details ?? {}} />
          <ObjectDetails title="Graduation details" value={student.graduation_details ?? {}} />
          <ObjectDetails title="Class 10 / 12 details" value={student.tenth_twelfth_details ?? {}} />

          {student.prior_employers.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-white">Prior employers</h3>
              <div className="space-y-2">
                {student.prior_employers.map((employer, index) => (
                  <div key={`${employer.company}-${index}`} className="rounded-md border border-neutral-800 p-3 text-sm text-neutral-300">
                    <strong className="text-white">{employer.company}</strong>
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
        <section>
          <div className="mb-3 print:hidden">
            <h3 className="text-sm font-medium text-white">Attached application CV</h3>
            <p className="text-xs text-neutral-500">
              Version {cvDocument?.version_no} · template {cvDocument?.template_id}
            </p>
          </div>
          <ResumePreview content={content} templateId={cvDocument?.template_id} />
        </section>
      ) : (
        <p className="rounded-md border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-300">
          This application has no attached CV snapshot.
        </p>
      )}
    </article>
  );
}
