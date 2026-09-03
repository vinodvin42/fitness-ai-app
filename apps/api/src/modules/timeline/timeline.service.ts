import { prisma } from "../../db/prisma";
import { getPersonalRecords } from "../progress/progress.service";

/**
 * Timeline (docs/mobile/03-screen-inventory.md §G). Built as a real, honest
 * "milestone spine" computed live from data this app already has —
 * ExerciseSetLog (via progress.service.ts's getPersonalRecords), and
 * WorkoutSession/Program (for workout-count milestones and program
 * completions) — rather than a stored TimelineEvent table. Same
 * "computed, not stored" pattern as Personal Records itself.
 *
 * Deliberately NOT built: "Goal Reached" events (no goal-setting feature
 * exists yet — see docs/mobile/07-open-questions-gaps.md §10) and "VO2 max
 * improvement" events (needs Recovery & Devices wearable data — §13/§E).
 * Coach-comment annotations (Timeline Month, in the client) also aren't
 * built — no Coach infra until Phase 5.
 *
 * Events don't have real database IDs — they're derived, not stored — so
 * each gets a synthetic, stable `id` built from its source (exerciseId,
 * milestone count, or programId). The client passes the full event object
 * through navigation rather than re-fetching a single event by id, since
 * there's no single-event endpoint to fetch from.
 */

export type TimelineEventType = "pr" | "milestone" | "program_complete";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  detail: string;
  occurredAt: Date;
}

const WORKOUT_COUNT_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 500];

interface ProgramCompletionTracker {
  programId: string;
  programName: string;
  totalWorkouts: number;
  completedWorkoutIds: Set<string>;
  becameCompleteAt: Date | null;
}

export async function listTimelineEvents(userId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  // ---- Personal Records ---------------------------------------------
  const personalRecords = await getPersonalRecords(userId);
  for (const pr of personalRecords) {
    events.push({
      id: `pr:${pr.exerciseId}`,
      type: "pr",
      title: `New PR: ${pr.exerciseName}`,
      detail: `${pr.bestWeightKg} kg × ${pr.reps} reps`,
      occurredAt: pr.achievedAt,
    });
  }

  // ---- Workout-count milestones + Program completions — both derived
  // from one pass over this user's completed sessions, oldest first, so
  // "became complete at" and "Nth workout" both land on the right date.
  const sessions = await prisma.workoutSession.findMany({
    where: { userId, status: "completed" },
    include: {
      workout: {
        select: {
          id: true,
          programId: true,
          program: { select: { id: true, name: true, workouts: { select: { id: true } } } },
        },
      },
    },
    orderBy: { completedAt: "asc" },
  });

  const trackers = new Map<string, ProgramCompletionTracker>();
  let completedCount = 0;

  for (const session of sessions) {
    completedCount += 1;
    if (WORKOUT_COUNT_MILESTONES.includes(completedCount) && session.completedAt) {
      events.push({
        id: `milestone:${completedCount}`,
        type: "milestone",
        title: `${completedCount} workouts completed`,
        detail: `You've logged ${completedCount} completed workouts — keep going.`,
        occurredAt: session.completedAt,
      });
    }

    const programId: string = session.workout.programId;
    const tracker: ProgramCompletionTracker = trackers.get(programId) ?? {
      programId,
      programName: session.workout.program.name,
      totalWorkouts: session.workout.program.workouts.length,
      completedWorkoutIds: new Set<string>(),
      becameCompleteAt: null,
    };
    tracker.completedWorkoutIds.add(session.workoutId);
    if (!tracker.becameCompleteAt && tracker.totalWorkouts > 0 && tracker.completedWorkoutIds.size === tracker.totalWorkouts) {
      tracker.becameCompleteAt = session.completedAt;
    }
    trackers.set(programId, tracker);
  }

  for (const tracker of trackers.values()) {
    if (tracker.becameCompleteAt) {
      events.push({
        id: `program_complete:${tracker.programId}`,
        type: "program_complete",
        title: `Completed ${tracker.programName}`,
        detail: `All ${tracker.totalWorkouts} workouts finished.`,
        occurredAt: tracker.becameCompleteAt,
      });
    }
  }

  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return events;
}
