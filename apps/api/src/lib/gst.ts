import { prisma } from "../db/prisma";

/** India GST rate used when no active TaxConfig row exists. */
export const DEFAULT_GST_PERCENT = 18;

/** The GST rate in force (the newest active Indian TaxConfig, else 18%). */
export async function activeGstPercent(): Promise<number> {
  const config = await prisma.taxConfig.findFirst({
    where: { isActive: true, jurisdiction: "IN" },
    orderBy: { updatedAt: "desc" },
  });
  if (!config?.ratePercent) return DEFAULT_GST_PERCENT;
  return Number(config.ratePercent);
}

/** GST added on top of a net amount (coach fees, blueprint 4.3). */
export function gstOnTop(netCents: number, gstPercent: number): number {
  return Math.round((netCents * gstPercent) / 100);
}
