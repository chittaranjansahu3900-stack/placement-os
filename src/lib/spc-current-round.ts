import type { RoundHistoryEntry } from "@/types/domain";

export type ApplicationRoundSource = {
  jd_id: string;
  round_history: unknown;
};

export type CurrentRound = {
  round: string;
  scheduledAt: string | null;
  location: string | null;
  assignedAt: string;
  candidateCount: number;
};

function entries(value: unknown): RoundHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.round !== "string" || typeof row.assigned_at !== "string") return [];
    return [{
      round: row.round,
      scheduled_at: typeof row.scheduled_at === "string" ? row.scheduled_at : null,
      location: typeof row.location === "string" ? row.location : null,
      assigned_by_user_id: typeof row.assigned_by_user_id === "string" ? row.assigned_by_user_id : "",
      assigned_at: row.assigned_at,
    }];
  });
}

export function currentRoundByJd(rows: ApplicationRoundSource[]): Map<string, CurrentRound> {
  const applications = rows.map((row) => ({ ...row, rounds: entries(row.round_history) }));
  const result = new Map<string, CurrentRound>();
  const jdIds = new Set(applications.map((row) => row.jd_id));

  for (const jdId of jdIds) {
    const jdApplications = applications.filter((row) => row.jd_id === jdId);
    const latest = jdApplications
      .flatMap((row) => row.rounds)
      .sort((left, right) => Date.parse(right.assigned_at) - Date.parse(left.assigned_at))[0];
    if (!latest) continue;
    const candidateCount = jdApplications.filter((row) => row.rounds.at(-1)?.round === latest.round).length;
    result.set(jdId, {
      round: latest.round,
      scheduledAt: latest.scheduled_at,
      location: latest.location,
      assignedAt: latest.assigned_at,
      candidateCount,
    });
  }
  return result;
}
