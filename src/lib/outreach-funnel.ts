export type FunnelActivity = {
  batch_id: string | null;
  company_id: string;
  logged_by_user_id: string | null;
  merge_status: string | null;
};

export type FunnelCompany = { id: string; pipeline_stage: string };
export type FunnelUser = { id: string; name: string };

export type OutreachFunnelRow = {
  userId: string;
  name: string;
  contacted: number;
  responded: number;
  onboarded: number;
  responseRate: number;
  onboardingRate: number;
};

export function outreachFunnel(
  batchId: string,
  jpcs: FunnelUser[],
  activities: FunnelActivity[],
  companies: FunnelCompany[],
): OutreachFunnelRow[] {
  const companyStage = new Map(companies.map((company) => [company.id, company.pipeline_stage]));
  return jpcs.map((jpc) => {
    const ownActivities = activities.filter(
      (activity) => activity.batch_id === batchId && activity.logged_by_user_id === jpc.id,
    );
    const contacted = new Set(ownActivities.map((activity) => activity.company_id));
    const responded = new Set(
      ownActivities
        .filter((activity) => activity.merge_status === "responded")
        .map((activity) => activity.company_id),
    );
    const onboarded = new Set(
      [...contacted].filter((companyId) => companyStage.get(companyId) === "onboarded"),
    );
    return {
      userId: jpc.id,
      name: jpc.name,
      contacted: contacted.size,
      responded: responded.size,
      onboarded: onboarded.size,
      responseRate: contacted.size ? Math.round((responded.size / contacted.size) * 100) : 0,
      onboardingRate: contacted.size ? Math.round((onboarded.size / contacted.size) * 100) : 0,
    };
  });
}
