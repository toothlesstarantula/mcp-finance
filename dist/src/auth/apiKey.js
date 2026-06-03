import crypto from 'node:crypto';
import { financeDb } from '../db/finance.js';
import { env } from '../env.js';
/**
 * Hash estable del API key (SHA-256) usando un salt del entorno.
 * La BD solo almacena `keyHash`, nunca el secreto en claro.
 */
export function hashApiKey(apiKeyPlain) {
    return crypto
        .createHash('sha256')
        .update(`${env.API_KEY_SALT}:${apiKeyPlain}`)
        .digest('hex');
}
/**
 * Autentica un API key contra la tabla `ApiKey`.
 *
 * NOTA (Task 6): en auth EXITOSO se debe actualizar `ApiKey.lastUsedAt`.
 */
export async function authenticateApiKey(apiKeyPlain) {
    const trimmed = apiKeyPlain.trim();
    if (!trimmed)
        return null;
    const keyHash = hashApiKey(trimmed);
    const apiKey = await financeDb.apiKey.findUnique({
        where: { keyHash },
        select: { id: true, userId: true, label: true }
    });
    if (!apiKey)
        return null;
    await financeDb.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() }
    });
    return { apiKeyId: apiKey.id, userId: apiKey.userId, label: apiKey.label };
}
