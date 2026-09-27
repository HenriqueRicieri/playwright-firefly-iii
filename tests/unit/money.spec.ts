import { test, expect } from '@playwright/test';
import { money, sumMoney } from '../../src/data/money';

// The suite's own money helpers decide whether a balance assertion is right. They get tests too.

test.describe('money()', () => {
  test('normalizes the 12 decimals Firefly returns', () => {
    expect(money('10.250000000000')).toBe('10.25');
    expect(money('0.010000000000')).toBe('0.01');
    expect(money('-123.450000000000')).toBe('-123.45');
    expect(money('98765432.190000000000')).toBe('98765432.19');
  });

  test('pads amounts with fewer decimals', () => {
    expect(money('5')).toBe('5.00');
    expect(money('5.5')).toBe('5.50');
  });

  test('refuses to round instead of hiding a sub-cent difference', () => {
    expect(() => money('10.999000000000')).toThrow(/without rounding/);
    expect(() => money('0.004')).toThrow(/without rounding/);
  });

  test('keeps sub-cent precision when asked for more decimals', () => {
    expect(money('10.999000000000', 3)).toBe('10.999');
  });

  test('rejects anything that is not a plain decimal', () => {
    for (const value of ['10,50', '1e3', 'abc', '', '1.2.3', '€10.00']) {
      expect(() => money(value), value).toThrow(/Not a decimal amount/);
    }
  });
});

test.describe('sumMoney()', () => {
  test('is exact where floats are not', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney('0.10', '0.20')).toBe('0.30');
  });

  test('handles signs and crossing zero', () => {
    expect(sumMoney('500.00', '-123.450000000000')).toBe('376.55');
    expect(sumMoney('10.00', '-10.01')).toBe('-0.01');
    expect(sumMoney('-0.50', '0.50')).toBe('0.00');
  });

  test('sums many sub-cent parts into an exact total', () => {
    expect(sumMoney(...Array.from({ length: 250 }, () => '0.004'))).toBe('1.00');
  });

  test('keeps large values exact', () => {
    expect(sumMoney('9007199254740991.99', '0.01')).toBe('9007199254740992.00');
  });
});
