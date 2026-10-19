/**
 * Supersets (Figma 03b log/03, Batch 3b): exercises sharing a letter are done
 * back to back — A1 then A2 — and the rest comes after the last one. Pure, so
 * the rules can be checked without React.
 */

export interface SupersetEntry {
  exercise: { id: string };
  supersetGroup: string | null;
  targetSets: number;
}

/** Positions (in list order) of every exercise in this entry's group; just [index] when it has none. */
export function groupMembers(list: readonly SupersetEntry[], index: number): number[] {
  const group = list[index]?.supersetGroup;
  if (!group) return [index];
  return list.map((e, i) => (e.supersetGroup === group ? i : -1)).filter((i) => i >= 0);
}

/** "A1", "A2"… for an entry in a superset; null otherwise. */
export function supersetLabel(list: readonly SupersetEntry[], index: number): string | null {
  const group = list[index]?.supersetGroup;
  if (!group) return null;
  return `${group}${groupMembers(list, index).indexOf(index) + 1}`;
}

/** First letter A–Z not used by another group in this list (null if all 26 are taken). */
export function nextFreeLetter(list: readonly SupersetEntry[]): string | null {
  const used = new Set(list.map((e) => e.supersetGroup).filter(Boolean));
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    if (!used.has(letter)) return letter;
  }
  return null;
}

/**
 * Where to go after logging a working set on `index`, given each exercise's
 * working-set count INCLUDING that set. Outside a superset: stay and rest.
 * Inside one: move to the next partner that still has sets left, no rest;
 * after the last partner, rest and go back to the first partner with sets
 * left (or stay when the round finished every partner).
 */
export function afterWorkingSet(
  list: readonly SupersetEntry[],
  index: number,
  workingCount: (exerciseId: string) => number,
): { nextIndex: number; rest: boolean } {
  const members = groupMembers(list, index);
  if (members.length < 2) return { nextIndex: index, rest: true };
  const hasSetsLeft = (i: number) => workingCount(list[i].exercise.id) < list[i].targetSets;
  const pos = members.indexOf(index);
  const laterPartner = members.slice(pos + 1).find(hasSetsLeft);
  if (laterPartner !== undefined) return { nextIndex: laterPartner, rest: false };
  const firstWithSets = members.find(hasSetsLeft);
  return { nextIndex: firstWithSets ?? index, rest: true };
}
