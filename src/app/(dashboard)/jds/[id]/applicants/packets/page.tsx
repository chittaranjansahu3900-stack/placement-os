import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePacket } from "@/components/candidate-packet";
import { PacketPrintButton } from "@/components/packet-print-button";
import { loadCandidatePackets } from "@/lib/candidate-packets";
import { createClient } from "@/lib/supabase/server";
import type { ApplicantDirectoryRow } from "@/types/domain";

export default async function CandidatePacketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: jd }, { data: applicantRows }] = await Promise.all([
    supabase.from("jds").select("role_title, companies(name)").eq("id", id).single(),
    supabase.from("applicant_directory").select("*").eq("jd_id", id).order("name", { ascending: true }),
  ]);
  if (!jd) notFound();
  const packets = await loadCandidatePackets(supabase, (applicantRows ?? []) as ApplicantDirectoryRow[]);
  const typedJd = jd as unknown as { role_title: string; companies: { name: string } | null };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div><Link href={`/jds/${id}/applicants`} className="text-xs text-blue-400 hover:underline">← Back to applicants</Link><h1 className="mt-2 text-lg font-semibold text-white">Merged candidate packets</h1><p className="text-sm text-neutral-400">{typedJd.companies?.name ?? "Unknown company"} — {typedJd.role_title} · {packets.length} packet{packets.length === 1 ? "" : "s"}</p></div>
        {packets.length > 0 && <PacketPrintButton />}
      </div>
      {packets.length > 0 ? <div className="candidate-packets-print-root space-y-10">{packets.map((packet) => <CandidatePacket key={packet.applicant.application_id} packet={packet} />)}</div> : <p className="rounded-md border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">No candidate packets are available for export.</p>}
    </div>
  );
}
