import { z } from 'zod';

// Runtime contract for the parts of the Firefly III API the suite reads. Every response goes through these
// schemas, so a field that changes type or disappears fails the test that hit it, naming the field,
// instead of turning into `undefined` somewhere further down.

/** Money travels as a decimal string ("10.250000000000"), never as a JSON number that could lose cents. */
export const DecimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'expected a decimal string');

export const Id = z.string().regex(/^\d+$/, 'expected a numeric id as a string');

export const TransactionType = z.enum(['withdrawal', 'deposit', 'transfer']);

/** Types Firefly creates by itself, e.g. the correction stored by a reconciliation. */
export const StoredTransactionType = z.enum([
  'withdrawal',
  'deposit',
  'transfer',
  'reconciliation',
  'opening balance',
]);

export const AccountResource = z.object({
  id: Id,
  type: z.literal('accounts'),
  attributes: z.object({
    name: z.string(),
    type: z.string(),
    currency_code: z.string().length(3),
    current_balance: DecimalString,
    opening_balance: DecimalString.nullable(),
  }),
});

export const SplitAttributes = z.object({
  transaction_journal_id: Id,
  type: StoredTransactionType,
  date: z.iso.datetime({ offset: true }),
  description: z.string(),
  amount: DecimalString,
  currency_code: z.string().length(3),
  foreign_amount: DecimalString.nullable(),
  foreign_currency_code: z.string().length(3).nullable(),
  source_id: Id,
  source_name: z.string(),
  destination_id: Id,
  destination_name: z.string(),
  reconciled: z.boolean(),
  category_name: z.string().nullable(),
  budget_id: Id.nullable(),
});

export const TransactionResource = z.object({
  id: Id,
  type: z.literal('transactions'),
  attributes: z.object({
    group_title: z.string().nullable(),
    transactions: z.array(SplitAttributes).min(1),
  }),
});

export const IdOnlyResource = z.object({ id: Id });

export const BudgetLimitResource = z.object({
  id: Id,
  attributes: z.object({
    amount: DecimalString,
    spent: z.array(z.object({ sum: DecimalString, currency_code: z.string().length(3) })),
  }),
});

/** Body of a 422 response: a message plus the failing fields, each with its messages. */
export const ValidationError = z.object({
  message: z.string(),
  errors: z.record(z.string(), z.array(z.string())),
});

export const Unauthenticated = z.object({ message: z.literal('Unauthenticated.') });

/** Wraps a resource schema in Firefly's `{ data: ... }` envelope. */
export function envelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}
