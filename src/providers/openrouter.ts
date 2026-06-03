import { env } from '../env.js';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

/**
 * Llama a OpenRouter (OpenAI-compatible) y fuerza salida JSON con response_format=json_object.
 * Devuelve el JSON parseado desde `choices[0].message.content`.
 */
export async function openrouterChatJson<T>(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal }
): Promise<T> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no está configurado');
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      response_format: { type: 'json_object' },
      messages
    }),
    signal: options?.signal
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OpenRouterChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error('Respuesta inválida de OpenRouter: message.content no es string');
  }

  return JSON.parse(content) as T;
}

