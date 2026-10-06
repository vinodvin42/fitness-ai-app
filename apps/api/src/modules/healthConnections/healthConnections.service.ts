import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ConnectHealthInput } from "./healthConnections.schema";

/**
 * Health-data provider consents (Settings > Health Connect). This records
 * what the user granted; no vendor SDK or OAuth exchange happens here.
 */

type ConnRow = {
  id: string;
  provider: string;
  status: string;
  scopes: string[];
  connectedAt: Date;
  revokedAt: Date | null;
};

function toItem(c: ConnRow) {
  return {
    id: c.id,
    provider: c.provider,
    status: c.status,
    scopes: c.scopes,
    connectedAt: c.connectedAt,
    revokedAt: c.revokedAt,
  };
}

export async function listConnections(userId: string) {
  const rows = (await prisma.healthConnection.findMany({
    where: { userId },
    orderBy: { connectedAt: "desc" },
  })) as ConnRow[];
  return { items: rows.map(toItem) };
}

export async function connect(userId: string, input: ConnectHealthInput) {
  const now = new Date();
  const row = await prisma.healthConnection.upsert({
    where: { userId_provider: { userId, provider: input.provider } },
    create: { userId, provider: input.provider, scopes: input.scopes, connectedAt: now },
    update: { status: "connected", scopes: input.scopes, connectedAt: now, revokedAt: null },
  });

  await recordAudit({
    actorId: userId,
    action: "health_connection.connected",
    entityType: "HealthConnection",
    entityId: row.id,
    metadata: { provider: input.provider, scopes: input.scopes },
  });

  return toItem(row as ConnRow);
}

export async function revoke(userId: string, connectionId: string) {
  const existing = await prisma.healthConnection.findUnique({ where: { id: connectionId } });
  if (!existing || existing.userId !== userId) {
    throw new ApiHttpError(404, "health_connection_not_found", "Health connection not found");
  }
  const row = await prisma.healthConnection.update({
    where: { id: connectionId },
    data: { status: "revoked", revokedAt: new Date() },
  });

  await recordAudit({
    actorId: userId,
    action: "health_connection.revoked",
    entityType: "HealthConnection",
    entityId: row.id,
    metadata: { provider: row.provider },
  });

  return toItem(row as ConnRow);
}
