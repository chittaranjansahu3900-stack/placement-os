import { createClient } from "@/lib/supabase/server";
import type { ApplicantDirectoryRow, CvDocument, Student } from "@/types/domain";

export const PACKET_VISIBLE_STATUSES = [
  "shortlisted",
  "interview",
  "selected",
  "waitlisted",
] as const;

export function canViewCandidatePacket(status: string): boolean {
  return PACKET_VISIBLE_STATUSES.includes(
    status as (typeof PACKET_VISIBLE_STATUSES)[number],
  );
}

export interface CandidatePacketData {
  applicant: ApplicantDirectoryRow;
  student: Student;
  cvDocument: CvDocument | null;
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Loads packet JSON through the masking/scope RPC; never queries raw profile rows. */
export async function loadCandidatePackets(
  supabase: ServerSupabaseClient,
  applicants: ApplicantDirectoryRow[],
): Promise<CandidatePacketData[]> {
  if (applicants.length === 0) return [];

  const { data, error } = await supabase.rpc("get_candidate_packets", {
    p_application_ids: applicants.slice(0, 500).map((applicant) => applicant.application_id),
  });
  if (error) return [];

  const packetRows = (data ?? []) as Array<{
    application_id: string;
    student: Student;
    cv_document: CvDocument | null;
  }>;
  const packetByApplication = new Map(packetRows.map((row) => [row.application_id, row]));

  return applicants.flatMap((applicant) => {
    const packet = packetByApplication.get(applicant.application_id);
    if (!packet?.student) return [];
    return [{ applicant, student: packet.student, cvDocument: packet.cv_document }];
  });
}
