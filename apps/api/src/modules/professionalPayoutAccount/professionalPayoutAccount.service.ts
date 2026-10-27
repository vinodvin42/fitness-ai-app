import type { ProfessionalPayoutAccount } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { recordAudit } from "../../middleware/auditLog";
import { notifyProfessional } from "../professionalNotifications/professionalNotifications.service";
import {
  decryptPayoutField,
  encryptPayoutField,
  isPayoutCryptoConfigured,
  maskAccountNumber,
  maskUpiId,
} from "./payoutCrypto";
import type { SavePayoutAccountInput, VerifyPayoutAccountInput } from "./professionalPayoutAccount.schema";

// Response shapes. Mirrored in packages/types (PayoutAccountView etc.), which
// the API can't import (outside its rootDir); keep the two in step.
type PayoutAccountView = {
  method: "bank" | "upi";
  accountHolderName: string;
  maskedDisplay: string;
  last4: string | null;
  ifsc: string | null;
  status: "pending" | "verified" | "rejected";
  adminNotes: string | null;
  verifiedAt: string | null;
  updatedAt: string;
};
type PayoutAccountResponse = { account: PayoutAccountView | null; editable: boolean };
type AdminPayoutAccountView = PayoutAccountView & { verifiedByAdminId: string | null; createdAt: string };
type AdminPayoutAccountResponse = { account: AdminPayoutAccountView | null; revealAvailable: boolean };
type AdminPayoutAccountRevealResponse = {
  method: "bank" | "upi";
  accountHolderName: string;
  accountNumber: string | null;
  ifsc: string | null;
  upiId: string | null;
};

/**
 * Coach payout details (27 Oct 2026, owner decision). Before this, the
 * Earnings screen told coaches to email their bank details to support.
 *
 * - A coach saves a bank account (holder, account number, IFSC) or a UPI ID.
 *   The account number, IFSC and UPI ID are stored only as ciphertext
 *   (payoutCrypto.ts); `maskedDisplay`/`last4` are what screens show.
 * - Every save sets the status back to `pending`: details an admin hasn't
 *   checked are never treated as verified.
 * - An admin verifies or rejects (audited, maker-checker like every payout
 *   action) and the coach gets a notice. Seeing the full details is a
 *   separate, reason-gated, audited reveal.
 * - Plaintext is never logged, audited or returned, except by the reveal.
 */

const AUDIT_ENTITY = "ProfessionalPayoutAccount";

export function payoutDetailsUnavailable(): ApiHttpError {
  return new ApiHttpError(
    503,
    "payout_details_unavailable",
    "Payout details can't be saved right now. Please try again later or contact Fynrox support.",
  );
}

/** The IFSC is shown (it names a branch, not an account), but it's stored encrypted, so it needs the key. */
function readIfsc(row: ProfessionalPayoutAccount): string | null {
  if (row.method !== "bank" || !row.ifscEncrypted || !isPayoutCryptoConfigured()) return null;
  try {
    return decryptPayoutField(row.professionalId, "ifsc", row.ifscEncrypted);
  } catch {
    // Wrong or rotated key, or a tampered value. Never log the value itself.
    console.error(`payout account ${row.id}: IFSC could not be decrypted`);
    return null;
  }
}

function toView(row: ProfessionalPayoutAccount): PayoutAccountView {
  return {
    method: row.method,
    accountHolderName: row.accountHolderName,
    maskedDisplay: row.maskedDisplay,
    last4: row.last4,
    ifsc: readIfsc(row),
    status: row.status,
    adminNotes: row.adminNotes,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminView(row: ProfessionalPayoutAccount): AdminPayoutAccountView {
  return { ...toView(row), verifiedByAdminId: row.verifiedByAdminId, createdAt: row.createdAt.toISOString() };
}

/** What the audit log keeps about a set of details: never the plaintext. */
function auditState(row: Pick<ProfessionalPayoutAccount, "method" | "status" | "maskedDisplay">) {
  return { method: row.method, status: row.status, maskedDisplay: row.maskedDisplay };
}

// ---- Coach ----------------------------------------------------------------

export async function getMyPayoutAccount(professionalId: string): Promise<PayoutAccountResponse> {
  const row = await prisma.professionalPayoutAccount.findUnique({ where: { professionalId } });
  return { account: row ? toView(row) : null, editable: isPayoutCryptoConfigured() };
}

export async function saveMyPayoutAccount(professionalId: string, input: SavePayoutAccountInput): Promise<PayoutAccountResponse> {
  if (!isPayoutCryptoConfigured()) throw payoutDetailsUnavailable();

  const encrypted =
    input.method === "bank"
      ? {
          accountNumberEncrypted: encryptPayoutField(professionalId, "accountNumber", input.accountNumber),
          ifscEncrypted: encryptPayoutField(professionalId, "ifsc", input.ifsc),
          upiIdEncrypted: null,
          last4: input.accountNumber.slice(-4),
          maskedDisplay: maskAccountNumber(input.accountNumber),
        }
      : {
          accountNumberEncrypted: null,
          ifscEncrypted: null,
          upiIdEncrypted: encryptPayoutField(professionalId, "upiId", input.upiId),
          last4: null,
          maskedDisplay: maskUpiId(input.upiId),
        };

  const data = {
    method: input.method,
    accountHolderName: input.accountHolderName,
    ...encrypted,
    // Any change needs a fresh check before a payout uses it.
    status: "pending" as const,
    adminNotes: null,
    verifiedAt: null,
    verifiedByAdminId: null,
  };

  const before = await prisma.professionalPayoutAccount.findUnique({ where: { professionalId } });
  const row = await prisma.professionalPayoutAccount.upsert({
    where: { professionalId },
    create: { professionalId, ...data },
    update: data,
  });

  await recordAudit({
    actorProfessionalId: professionalId,
    action: before ? "professional.payout_account.updated" : "professional.payout_account.created",
    entityType: AUDIT_ENTITY,
    entityId: row.id,
    stateBefore: before ? auditState(before) : null,
    stateAfter: auditState(row),
    metadata: { professionalId },
  });

  return { account: toView(row), editable: true };
}

// ---- Admin ----------------------------------------------------------------

async function assertProfessional(professionalId: string): Promise<void> {
  const pro = await prisma.professional.findUnique({ where: { id: professionalId }, select: { id: true } });
  if (!pro) throw new ApiHttpError(404, "not_found", "Professional not found");
}

async function findAccountOr404(professionalId: string): Promise<ProfessionalPayoutAccount> {
  await assertProfessional(professionalId);
  const row = await prisma.professionalPayoutAccount.findUnique({ where: { professionalId } });
  if (!row) throw new ApiHttpError(404, "payout_account_not_found", "This coach hasn't added payout details yet");
  return row;
}

export async function getPayoutAccountForAdmin(professionalId: string): Promise<AdminPayoutAccountResponse> {
  await assertProfessional(professionalId);
  const row = await prisma.professionalPayoutAccount.findUnique({ where: { professionalId } });
  return { account: row ? toAdminView(row) : null, revealAvailable: isPayoutCryptoConfigured() };
}

/**
 * The only place full details leave the API. The audit entry (with the
 * admin's reason) is written BEFORE anything is returned, so a reveal that
 * isn't on record can't happen.
 */
export async function revealPayoutAccount(adminId: string, professionalId: string, reason: string): Promise<AdminPayoutAccountRevealResponse> {
  const row = await findAccountOr404(professionalId);
  if (!isPayoutCryptoConfigured()) {
    throw new ApiHttpError(503, "payout_details_unavailable", "Payout details can't be revealed: the encryption key isn't configured.");
  }

  let details: AdminPayoutAccountRevealResponse;
  try {
    details = {
      method: row.method,
      accountHolderName: row.accountHolderName,
      accountNumber: row.accountNumberEncrypted ? decryptPayoutField(professionalId, "accountNumber", row.accountNumberEncrypted) : null,
      ifsc: row.ifscEncrypted ? decryptPayoutField(professionalId, "ifsc", row.ifscEncrypted) : null,
      upiId: row.upiIdEncrypted ? decryptPayoutField(professionalId, "upiId", row.upiIdEncrypted) : null,
    };
  } catch {
    console.error(`payout account ${row.id}: details could not be decrypted for reveal`);
    throw new ApiHttpError(500, "payout_details_unreadable", "These payout details can't be decrypted. Ask the coach to enter them again.");
  }

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.professional_payout_account.revealed",
    entityType: AUDIT_ENTITY,
    entityId: row.id,
    reason,
    metadata: { professionalId, ...auditState(row) },
  });

  return details;
}

export async function verifyPayoutAccount(
  adminId: string,
  professionalId: string,
  input: VerifyPayoutAccountInput,
): Promise<{ account: AdminPayoutAccountView }> {
  const row = await findAccountOr404(professionalId);
  const verified = input.status === "verified";

  // Only the exact version the admin looked at. updateMany so the check and
  // the write are one statement: a coach edit landing in between makes the
  // count 0 instead of verifying details nobody saw.
  const { count } = await prisma.professionalPayoutAccount.updateMany({
    where: { id: row.id, updatedAt: new Date(input.updatedAt) },
    data: {
      status: input.status,
      adminNotes: input.adminNotes || null,
      verifiedAt: verified ? new Date() : null,
      verifiedByAdminId: verified ? adminId : null,
    },
  });
  if (count === 0) {
    throw new ApiHttpError(
      409,
      "payout_account_changed",
      "The coach changed these payout details after you opened them. Reload and check the new details.",
    );
  }
  const updated = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { id: row.id } });

  await recordAudit({
    actorAdminId: adminId,
    action: verified ? "admin.professional_payout_account.verified" : "admin.professional_payout_account.rejected",
    entityType: AUDIT_ENTITY,
    entityId: row.id,
    stateBefore: auditState(row),
    stateAfter: auditState(updated),
    metadata: { professionalId, adminNotes: input.adminNotes ?? null },
  });

  await notifyProfessional(professionalId, {
    kind: "payout",
    title: verified ? "Your payout details are verified" : "Your payout details weren't accepted",
    body: verified
      ? `Fynrox verified your ${updated.method === "bank" ? "bank account" : "UPI ID"} ${updated.maskedDisplay}. Your payouts will go there.`
      : `Fynrox couldn't verify your payout details.${updated.adminNotes ? ` Reason: ${updated.adminNotes}` : ""} You can correct them on the Earnings page.`,
    link: "/earnings",
    email: true,
  });

  return { account: toAdminView(updated) };
}
