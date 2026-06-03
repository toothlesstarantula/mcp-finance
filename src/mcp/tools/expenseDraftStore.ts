import crypto from 'node:crypto';

export type ExpenseDraft = {
  draftId: string;
  userId: string;

  merchantRaw?: string;
  amountCents?: number;
  currency: string;
  occurredAt?: Date;
  paymentMethod?: string;
  description?: string | null;
  rawText?: string | null;
};

/**
 * In-memory store de borradores.
 * Key requerida por Task 12: draftId + userId.
 */
const drafts = new Map<string, ExpenseDraft>();

export function newDraftId(): string {
  return crypto.randomUUID();
}

export function draftKey(userId: string, draftId: string): string {
  return `${userId}:${draftId}`;
}

export function saveDraft(draft: ExpenseDraft): void {
  drafts.set(draftKey(draft.userId, draft.draftId), draft);
}

export function getDraft(userId: string, draftId: string): ExpenseDraft | undefined {
  return drafts.get(draftKey(userId, draftId));
}

export function deleteDraft(userId: string, draftId: string): void {
  drafts.delete(draftKey(userId, draftId));
}

