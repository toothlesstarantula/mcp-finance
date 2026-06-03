/**
 * Parser "MVP" de texto libre.
 *
 * Heurísticas:
 * - merchantRaw: primera palabra (uppercased)
 * - amount: último número "suelo" encontrado en el texto (1-7 dígitos)
 */
export function parseExpenseText(text) {
    const t = text.trim();
    if (!t)
        return {};
    // Captura números separados por espacios y toma el último como monto.
    // Ej: "uber 126" | "rappi 380 cena" | "oxxo 2 cocas 35"
    const amountMatch = t.match(/(?:^|\s)(\d{1,7})(?:\s|$)/g);
    let amount;
    if (amountMatch?.length) {
        const last = amountMatch[amountMatch.length - 1].trim();
        amount = Number(last);
        if (!Number.isFinite(amount) || amount <= 0)
            amount = undefined;
    }
    const merchantRaw = t.split(/\s+/)[0]?.toUpperCase();
    return { merchantRaw, amount, hint: t };
}
