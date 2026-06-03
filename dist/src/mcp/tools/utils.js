export function toolOk(params) {
    return {
        content: [
            {
                type: 'text',
                text: params.text ?? 'ok'
            }
        ],
        structuredContent: params.structuredContent
    };
}
export function toolError(message) {
    return {
        content: [{ type: 'text', text: message }],
        isError: true
    };
}
export function buildDraftQuestions(draft) {
    const questions = [];
    if (!draft.merchantRaw)
        questions.push('¿Cuál es el comercio (merchant)?');
    if (!draft.amountCents)
        questions.push('¿Cuánto fue el monto?');
    if (!draft.paymentMethod) {
        questions.push('¿Cuál fue el método de pago? (CASH | CARD_NU | CARD_BBVA | CARD_HSBC_VIVA)');
    }
    return questions;
}
