import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePacket } from "@/components/candidate-packet";
import { PacketPrintButton } from "@/components/packet-print-button";
import { loadCandidatePackets } from "@/lib/candidate-packets";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/ops-icon";
import type { ApplicantDirectoryRow } from "@/types/domain";

export default async function CandidatePacketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: jd }, { data: applicantRows }] = await Promise.all([
    supabase.from("jds").select("role_title, companies(name)").eq("id", id).single(),
    supabase.rpc("get_applicant_directory", { p_jd_id: id }),
  ]);
  if (!jd) notFound();
  const sortedApplicantRows = [...((applicantRows ?? []) as ApplicantDirectoryRow[])]
    .sort((left, right) => left.name.localeCompare(right.name));
  const packets = await loadCandidatePackets(supabase, sortedApplicantRows);
  const typedJd = jd as unknown as { role_title: string; companies: { name: string } | null };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5 print:hidden">
        <div>
          <Link href={`/jds/${id}/applicants`} className="font-mono text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
            <OpsIcon name="arrow-left" size={12} />
            <span>Back to Applicants Matrix</span>
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Merged Candidate Dossiers &amp; Packets</h1>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {typedJd.companies?.name ?? "Unknown company"} — {typedJd.role_title} · {packets.length} candidate packet{packets.length === 1 ? "" : "s"}
          </p>
        </div>
        {packets.length > 0 && <PacketPrintButton />}
      </div>
      {packets.length > 0 ? (
        <div className="candidate-packets-print-root space-y-10">
          {packets.map((packet) => (
            <CandidatePacket key={packet.applicant.application_id} packet={packet} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-slate-750 bg-slate-900/90 p-8 text-center text-xs font-mono text-slate-400 shadow-sm">
          No candidate packets are available for export.
        </p>
      )}
    </div>
  );
}
