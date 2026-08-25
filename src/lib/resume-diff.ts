// Minimal LCS-based line diff — no external dependency needed for the small
// bullet-list comparisons the Version Diff panel renders.
export type DiffLine = { type: "same" | "removed" | "added"; text: string };

export function diffLines(before: string[], after: string[]): DiffLine[] {
  const m = before.length;
  const n = after.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (before[i] === after[j]) {
      result.push({ type: "same", text: before[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "removed", text: before[i] });
      i++;
    } else {
      result.push({ type: "added", text: after[j] });
      j++;
    }
  }
  while (i < m) result.push({ type: "removed", text: before[i++] });
  while (j < n) result.push({ type: "added", text: after[j++] });
  return result;
}
