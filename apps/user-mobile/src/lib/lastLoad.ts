/**
 * "Last 24 kg × 10" for Workout Detail (Figma train/04): the heaviest working
 * set of this exercise in your most recent session that has one. Warm-ups,
 * drop sets and sets to failure are left out. Pure (tests/lastLoad.check.cjs).
 */
interface SetLike {
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  isWarmup?: boolean;
  isDropSet?: boolean;
  isFailure?: boolean;
}
interface SessionLike {
  startedAt?: string;
  completedAt?: string | null;
  setLogs?: SetLike[];
}

const kg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function lastLoadFor(sessions: readonly SessionLike[], exerciseId: string): string | null {
  const ordered = [...sessions].sort((a, b) => (b.completedAt ?? b.startedAt ?? "").localeCompare(a.completedAt ?? a.startedAt ?? ""));
  for (const s of ordered) {
    const sets = (s.setLogs ?? []).filter((l) => l.exerciseId === exerciseId && !l.isWarmup && !l.isDropSet && !l.isFailure);
    if (sets.length === 0) continue;
    const weighted = sets.filter((l) => l.weightKg != null && l.weightKg > 0);
    if (weighted.length === 0) return `${Math.max(...sets.map((l) => l.reps))} reps`;
    const top = weighted.reduce((a, b) => ((b.weightKg as number) > (a.weightKg as number) || ((b.weightKg as number) === (a.weightKg as number) && b.reps > a.reps) ? b : a));
    return `${kg(top.weightKg as number)} kg × ${top.reps}`;
  }
  return null;
}
