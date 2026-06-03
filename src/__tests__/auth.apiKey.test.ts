import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn()
}));

vi.mock('../db/finance.js', () => ({
  financeDb: {
    apiKey: {
      findUnique: mocks.findUnique,
      update: mocks.update
    }
  }
}));

vi.mock('../env.js', () => ({
  env: {
    API_KEY_SALT: 'test-salt'
  }
}));

import { authenticateApiKey, hashApiKey } from '../auth/apiKey.js';

describe('auth/apiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve null si no existe el apiKey (y no actualiza lastUsedAt)', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);

    const result = await authenticateApiKey('nope');

    expect(result).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('en auth exitoso actualiza ApiKey.lastUsedAt y devuelve el userId', async () => {
    const now = new Date('2026-01-02T03:04:05.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.findUnique.mockResolvedValueOnce({ id: 'ak_1', userId: 'u_1', label: 'dev' });
    mocks.update.mockResolvedValueOnce({ id: 'ak_1' });

    const result = await authenticateApiKey('plain-key');

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey('plain-key') },
      select: { id: true, userId: true, label: true }
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'ak_1' },
      data: { lastUsedAt: now }
    });
    expect(result).toEqual({ apiKeyId: 'ak_1', userId: 'u_1', label: 'dev' });

    vi.useRealTimers();
  });
});
