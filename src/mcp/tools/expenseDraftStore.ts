import crypto from "node:crypto";
import { financeDb } from "../../db/finance.js";
import type { PaymentMethod } from "../../../generated/prisma/enums.js";

/**
 * Borrador de gasto persistido en Postgres.
 * Sustituye al Map in-memory: sobrevive restarts, escala horizontal, y
 * permite TTL con `expiresAt` (un draft sin confirmar expira).
 */
export type ExpenseDraft = {
  draftId: string;
  userId: string;

  merchantRaw?: string;
  amountCents?: number;
  currency: string;
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
  description?: string | null;
  rawText?: string | null;
};

/** TTL de un draft sin confirmar (30 minutos). */
const DRAFT_TTL_MS = 30 * 60 * 1000;

export function newDraftId(): string {
  return crypto.randomUUID();
}

function draftKey(userId: string, draftId: string): string {
  return `${userId}:${draftId}`;
}

type PersistedDraft = Awaited<
  ReturnType<typeof financeDb.expenseDraft.findFirst>
>;

function toDomain(row: NonNullable<PersistedDraft>): ExpenseDraft {
  return {
    draftId: row.id,
    userId: row.userId,
    merchantRaw: row.merchantRaw ?? undefined,
    amountCents: row.amountCents ?? undefined,
    currency: row.currency,
    occurredAt: row.occurredAt ?? undefined,
    paymentMethod: (row.paymentMethod ?? undefined) as
      | PaymentMethod
      | undefined,
    description: row.description ?? null,
    rawText: row.rawText ?? null,
  };
}

/**
 * Persiste (upsert) un borrador. Si ya existe, lo reemplaza; útil cuando
 * `expense.confirm` aplica overrides al draft antes de validarlo.
 */
export async function saveDraft(draft: ExpenseDraft): Promise<void> {
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  await financeDb.expenseDraft.upsert({
    where: { id: draft.draftId },
    create: {
      id: draft.draftId,
      userId: draft.userId,
      merchantRaw: draft.merchantRaw ?? null,
      amountCents: draft.amountCents ?? null,
      currency: draft.currency,
      occurredAt: draft.occurredAt ?? null,
      paymentMethod: draft.paymentMethod ?? null,
      description: draft.description ?? null,
      rawText: draft.rawText ?? null,
      expiresAt,
    },
    update: {
      merchantRaw: draft.merchantRaw ?? null,
      amountCents: draft.amountCents ?? null,
      currency: draft.currency,
      occurredAt: draft.occurredAt ?? null,
      paymentMethod: draft.paymentMethod ?? null,
      description: draft.description ?? null,
      rawText: draft.rawText ?? null,
      expiresAt,
    },
  });
}

/**
 * Recupera un borrador por (userId, draftId). Si está expirado, lo borra
 * y devuelve undefined (el draft se considera inválido).
 */
export async function getDraft(
  userId: string,
  draftId: string,
): Promise<ExpenseDraft | undefined> {
  const row = await financeDb.expenseDraft.findUnique({
    where: { id: draftId },
  });
  if (!row) return undefined;
  if (row.userId !== userId) return undefined; // aislamiento por usuario
  if (row.expiresAt.getTime() <= Date.now()) {
    await financeDb.expenseDraft
      .delete({ where: { id: draftId } })
      .catch(() => {});
    return undefined;
  }
  return toDomain(row);
}

export async function deleteDraft(
  userId: string,
  draftId: string,
): Promise<void> {
  // Borra solo si pertenece al usuario (evita fugas cross-user).
  const row = await financeDb.expenseDraft.findUnique({
    where: { id: draftId },
    select: { userId: true },
  });
  if (!row || row.userId !== userId) return;
  await financeDb.expenseDraft.delete({ where: { id: draftId } });
}

/**
 * Limpieza explícita de drafts expirados. Pensada para correr como cron
 * o al arranque del server; el flujo normal no la necesita porque `getDraft`
 * ya hace lazy-purge.
 */
export async function purgeExpiredDrafts(): Promise<number> {
  const result = await financeDb.expenseDraft.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return result.count;
}

// Re-export del helper de key por compatibilidad con imports existentes.
export { draftKey };
