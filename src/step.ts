import { test } from '@playwright/test';

/**
 * Wraps a page object or API client method in a boxed `test.step`, so the HTML report and the trace read
 * "TransactionFormPage.createTransfer" instead of a flat list of clicks, and a failure inside the method
 * points at the line in the test that called it.
 */
export function step<This extends object, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Promise<Return>,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
) {
  return function (this: This, ...args: Args): Promise<Return> {
    const name = `${this.constructor.name}.${String(context.name)}`;
    return test.step(name, () => target.call(this, ...args), { box: true });
  };
}
