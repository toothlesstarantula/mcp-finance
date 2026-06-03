import crypto from 'node:crypto';
/**
 * In-memory store de borradores.
 * Key requerida por Task 12: draftId + userId.
 */
const drafts = new Map();
export function newDraftId() {
    return crypto.randomUUID();
}
export function draftKey(userId, draftId) {
    return `${userId}:${draftId}`;
}
export function saveDraft(draft) {
    drafts.set(draftKey(draft.userId, draft.draftId), draft);
}
export function getDraft(userId, draftId) {
    return drafts.get(draftKey(userId, draftId));
}
export function deleteDraft(userId, draftId) {
    drafts.delete(draftKey(userId, draftId));
}
