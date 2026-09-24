# End-to-end tests

Playwright tests that drive the real app in a browser.

| Spec | What it covers | Where it runs |
|---|---|---|
| `boonchai-job-to-billing.spec.ts` | Job with two containers → dispatch (own fleet + new subcontractor) → job sheet → advance → settlement → delivery → POD gate → customer share link → invoice with Thai VAT/WHT | The throwaway stack only. It writes data. |
| `smoke.spec.ts` | API reachable through the public origin, login page talks to the API over the same scheme, SPA routing | Anywhere, including production. Read-only. |

## Run locally

```bash
cd e2e
npm install
npx playwright install chromium
npm run stack:up      # builds the production images, starts Postgres/backend/frontend, seeds demo data
npm test
npm run stack:down    # removes the stack and its data
```

The stack serves the app and API on one origin, http://localhost:18080, behind a proxy that routes paths the way the production load balancer does. The port is offset so it can run alongside the dev stack.

## Smoke-test another environment

```bash
E2E_BASE_URL=https://tms.ather-ai.com npx playwright test smoke
```

The mutating flow skips itself whenever `E2E_BASE_URL` is set.
