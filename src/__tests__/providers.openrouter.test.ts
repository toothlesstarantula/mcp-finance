import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    OPENROUTER_API_KEY: 'or-test-key',
    OPENROUTER_MODEL: 'test-model'
  }
}));

import { openrouterChatJson } from '../providers/openrouter.js';

describe('providers/openrouter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('envía chat completions con response_format=json_object y parsea JSON desde choices[0].message.content', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true,"n":123}' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    (globalThis as any).fetch = fetchMock;

    const result = await openrouterChatJson<{ ok: boolean; n: number }>([
      { role: 'user', content: 'devuelve JSON' }
    ]);

    expect(result).toEqual({ ok: true, n: 123 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer or-test-key',
      'Content-Type': 'application/json'
    });

    expect(JSON.parse(init.body as string)).toEqual({
      model: 'test-model',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: 'devuelve JSON' }]
    });
  });
});

