import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { UpdateSetInput } from "./workoutSets.schema";

/**
 * Edit/delete a logged set. Allowed while the session is in_progress or
 * completed (fix a typo after finishing); abandoned sessions are frozen.
 */
async function getEditableSet(sessionId: string, setId: string, userId: string) {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw new ApiHttpError(404, "session_not_found", "Workout session not found");
  }
  if (session.status !== "in_progress" && session.status !== "completed") {
    throw new ApiHttpError(409, "session_not_editable", "This workout session can no longer be edited");
  }
  const setLog = await prisma.exerciseSetLog.findUnique({ where: { id: setId } });
  if (!setLog || setLog.sessionId !== session.id) {
    throw new ApiHttpError(404, "set_not_found", "Set not found");
  }
  return setLog;
}

export async function updateSet(sessionId: string, setId: string, userId: string, input: UpdateSetInput) {
  const setLog = await getEditableSet(sessionId, setId, userId);
  return prisma.exerciseSetLog.update({ where: { id: setLog.id }, data: input });
}

export async function deleteSet(sessionId: string, setId: string, userId: string) {
  const setLog = await getEditableSet(sessionId, setId, userId);
  await prisma.exerciseSetLog.delete({ where: { id: setLog.id } });
  return { deleted: true, id: setLog.id };
}
