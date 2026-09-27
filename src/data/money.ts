// Money is handled as decimal strings end to end. Never parse it into a float: 0.1 + 0.2 !== 0.3.
// Internally amounts are scaled to integers with 12 decimal places, the precision Firefly stores.

const SCALE = 12;
const FACTOR = 10n ** BigInt(SCALE);

function toUnits(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a decimal amount: "${value}"`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > SCALE) throw new Error(`More than ${SCALE} decimals: "${value}"`);
  const units = BigInt(whole!) * FACTOR + BigInt(fraction.padEnd(SCALE, '0'));
  return sign === '-' ? -units : units;
}

function fromUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / FACTOR;
  const fraction = (abs % FACTOR).toString().padStart(SCALE, '0');
  if (/[1-9]/.test(fraction.slice(decimals))) {
    throw new Error(`Cannot show ${units} units with ${decimals} decimals without rounding`);
  }
  const kept = fraction.slice(0, decimals);
  return `${negative ? '-' : ''}${whole}${decimals > 0 ? `.${kept}` : ''}`;
}

/**
 * Normalizes an amount to a fixed number of decimals, e.g. "10.250000000000" -> "10.25".
 * Throws instead of rounding, so a wrong sub-cent value can never hide inside an assertion.
 */
export function money(value: string, decimals = 2): string {
  return fromUnits(toUnits(value), decimals);
}

/** Exact sum of decimal amounts, e.g. sumMoney("0.10", "0.20") === "0.30". */
export function sumMoney(...values: string[]): string {
  return fromUnits(
    values.reduce((total, v) => total + toUnits(v), 0n),
    2,
  );
}
