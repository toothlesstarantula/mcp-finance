import { describe, expect, it } from 'vitest';
import { parseExpenseText } from '../services/parsing/parseExpenseText.js';

describe('parseExpenseText', () => {
  it('parses merchant and amount (simple case)', () => {
    expect(parseExpenseText('uber 126')).toEqual({
      merchantRaw: 'UBER',
      amount: 126,
      hint: 'uber 126'
    });
  });

  it('returns empty object for empty/blank text', () => {
    expect(parseExpenseText('   ')).toEqual({});
  });

  it('uses the last number found as amount', () => {
    expect(parseExpenseText('oxxo 2 cocas 35')).toEqual({
      merchantRaw: 'OXXO',
      amount: 35,
      hint: 'oxxo 2 cocas 35'
    });
  });
});

