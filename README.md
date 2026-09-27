# Playwright tests for Firefly III

[![Tests](https://github.com/HenriqueRicieri/playwright-firefly-iii/actions/workflows/tests.yml/badge.svg)](https://github.com/HenriqueRicieri/playwright-firefly-iii/actions/workflows/tests.yml)

End-to-end and API tests for [Firefly III](https://github.com/firefly-iii/firefly-iii), an open source personal
finance manager, written with Playwright and TypeScript.

In finance software a bug moves money. So most tests here follow one pattern:

1. **Arrange through the API:** create the accounts and transactions the test needs.
2. **Act through the UI:** do what a user would do.
3. **Assert through the API:** check the stored result, to the cent, below the screen.

## Run it

Requirements: Docker and Node 24.

```bash
npm ci
npx playwright install chromium
npm run env:up      # Firefly III 6.7.4 + MariaDB on http://localhost:8080
npm test
npm run report      # HTML report
npm run env:down    # removes the containers and the database
```

The suite prepares an empty instance by itself: it registers a test user, completes the first-run wizard and
creates a Personal Access Token through the UI. Nothing needs to be clicked by hand.

## Why these scenarios

**Accounts.** Every balance starts from the opening balance. If that is stored wrong, every number after it is
wrong too.

**Transactions and balances.** The core of a ledger. A withdrawal lowers the balance by exactly its amount, a
deposit raises it, and a transfer moves money between two accounts while their sum stays the same. Editing an
amount recalculates the balance and deleting a transaction puts it back.

**Amounts.** Where classic finance bugs live: one cent, very large numbers, zero and negative values, and
rounding. One test uses three withdrawals of 0.004 because the result tells the rounding strategies apart:
rounding each transaction gives 100.00, truncating the total gives 99.98, rounding the total gives 99.99.
Firefly rounds the total.

**API contract.** The API is a product surface, not only a shortcut for test setup: authentication, validation
messages per field, and a round trip where what is stored is what comes back.

Where Firefly's behavior is a design choice rather than a bug, the test documents it. For example, the amount
field accepts `10.999` for a currency with 2 decimals, stores it in full and rounds only the displayed balance.

## How the suite is built

```
docker/        pinned Firefly III + MariaDB for a disposable test instance
src/api/       thin typed client for the REST API
src/pages/     page objects, one per screen
src/fixtures/  Playwright fixtures (API client and page objects)
src/data/      unique test data and exact decimal math for money
tests/setup/   first run: user, wizard, guided tours, API token, saved session
tests/api/     API contract tests
tests/e2e/     UI flows checked through the API
```

Rules the suite follows:

- **Independent tests.** Each test creates its own data with unique names, so tests run in parallel and in any
  order.
- **No fixed waits.** Tests wait for state: a locator, a URL, a network response.
- **User-facing locators first** (`getByRole`, `getByPlaceholder`). Where Firefly's markup has no accessible name,
  the page object says why it falls back to an id.
- **Money is never a float.** Amounts stay decimal strings and are compared exactly, to the cent.
- **Pinned versions.** The Firefly III image tag is fixed, so a UI change upstream is a conscious upgrade, not a
  surprise failure.

A few things the suite had to handle, found while building it:

- Firefly shows a guided tour on the first visit to each screen. Closing it returns focus to the previously
  focused field, which sent typed text into the wrong input. The setup marks every tour as seen through the same
  endpoint the tour uses.
- The transaction form renders its inputs before the autocomplete is attached, and text typed before that never
  opens the suggestions. The page object waits until the input becomes a combobox.
- The browser runs in the same time zone as the app container, so "now" in the form is "now" on the server.

## CI

GitHub Actions starts the pinned Firefly III with an empty database, runs lint, typecheck and every test, and
publishes the HTML report. Traces of failed tests are uploaded as artifacts. The workflow can also be started by
hand with `repeat_each` to hunt for flaky tests.
