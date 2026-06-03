import type { ChatMessage } from '../../providers/openrouter.js';

export type LlmExpenseClassificationJson = {
  /**
   * Nombre de categoría EXACTO (uno de la lista proporcionada).
   * Ej: "Restaurantes / delivery"
   */
  category: string;
  /** Explicación breve (opcional). */
  reason?: string;
  /** Confianza opcional (0..1). */
  confidence?: number;
};

export function buildExpenseClassificationMessages(input: {
  merchantRaw: string;
  description?: string | null;
  rawText?: string | null;
  categories: string[];
}): ChatMessage[] {
  const categoriesList = input.categories.map((c) => `- ${c}`).join('\n');

  const userPayload = {
    merchantRaw: input.merchantRaw,
    description: input.description ?? undefined,
    rawText: input.rawText ?? undefined
  };

  return [
    {
      role: 'system',
      content: [
        'Eres un clasificador de gastos personales.',
        'Tu tarea: elegir la mejor categoría EXACTA de la lista proporcionada.',
        'Reglas:',
        '- Devuelve SOLO JSON válido (sin markdown).',
        '- El campo "category" DEBE ser exactamente uno de los nombres de la lista.',
        '- Si dudas, elige la opción más general/razonable dentro de la lista.',
        '',
        'Formato JSON esperado:',
        '{"category":"<nombre exacto>","reason":"<breve>","confidence":0.0}',
        '',
        'Categorías disponibles:',
        categoriesList
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Clasifica este gasto usando SOLO las categorías disponibles.',
        'Entrada:',
        JSON.stringify(userPayload)
      ].join('\n')
    }
  ];
}

