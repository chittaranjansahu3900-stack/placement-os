export type PlacementMetricStudent = {
  id: string;
  batch_id: string;
  placement_status: string;
};

export type PlacementMetricRecord = {
  student_id: string;
  company_id: string;
  final_ctc: number | null;
};

export type PlacementBatchMetrics = {
  total: number;
  placed: number;
  placementRate: number;
  averageCtc: number | null;
  medianCtc: number | null;
  highestCtc: number | null;
  hiringCompanies: number;
};

export function placementBatchMetrics(
  batchId: string,
  students: PlacementMetricStudent[],
  placements: PlacementMetricRecord[],
): PlacementBatchMetrics {
  const batchStudents = students.filter((student) => student.batch_id === batchId);
  const studentIds = new Set(batchStudents.map((student) => student.id));
  const batchPlacements = placements.filter((placement) => studentIds.has(placement.student_id));
  const ctcValues = batchPlacements
    .map((placement) => placement.final_ctc)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  const placed = batchStudents.filter((student) => student.placement_status === "placed").length;
  const middle = Math.floor(ctcValues.length / 2);
  const medianCtc = ctcValues.length === 0
    ? null
    : ctcValues.length % 2
      ? ctcValues[middle]
      : (ctcValues[middle - 1] + ctcValues[middle]) / 2;

  return {
    total: batchStudents.length,
    placed,
    placementRate: batchStudents.length ? (placed / batchStudents.length) * 100 : 0,
    averageCtc: ctcValues.length ? ctcValues.reduce((sum, value) => sum + value, 0) / ctcValues.length : null,
    medianCtc,
    highestCtc: ctcValues.length ? ctcValues[ctcValues.length - 1] : null,
    hiringCompanies: new Set(batchPlacements.map((placement) => placement.company_id)).size,
  };
}

export function metricDelta(current: number | null, baseline: number | null): number | null {
  return current === null || baseline === null ? null : current - baseline;
}
