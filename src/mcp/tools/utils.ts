export function toolOk<T extends Record<string, unknown>>(params: {
  structuredContent: T;
  text?: string;
}) {
  return {
    content: [
      {
        type: 'text' as const,
        text: params.text ?? 'ok'
      }
    ],
    structuredContent: params.structuredContent
  };
}

export function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true
  };
}

export function buildDraftQuestions(draft: {
  merchantRaw?: string;
  amountCents?: number;
  paymentMethod?: string;
}): string[] {
  const questions: string[] = [];
  if (!draft.merchantRaw) questions.push('¿Cuál es el comercio (merchant)?');
  if (!draft.amountCents) questions.push('¿Cuánto fue el monto?');
  if (!draft.paymentMethod) {
    questions.push('¿Cuál fue el método de pago? (CASH | CARD_NU | CARD_BBVA | CARD_HSBC_VIVA)');
  }
  return questions;
}

