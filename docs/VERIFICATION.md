# Verification

Use synthetic customer data only. Never put real credentials, tokens or customer records in screenshots or submitted AI transcripts.

## Automated checks

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

- `tests/validation.test.ts`: Zod customer/quantity validation and mocked order RPC boundaries. Includes whitespace-only names/address, mixed-case Gmail, exact domain, malformed email, ASCII phone/leading zero, integer quantities 1–100, stripped client prices and database failure.
- `tests/order-email.test.ts`: mocked Resend and database calls. Checks a fixed server-configured recipient, saved-order-only sends, awaiting the send attempt, idempotency/timeout options, missing/invalid configuration, provider errors returned as values, network exceptions, privacy-safe logs and preserving HTTP 201 after an email failure. These tests send no real email.
- `tests/admin-api.test.ts`: mocked Supabase Auth/authorization responses exercised through real Next route handlers. Missing/invalid tokens, unauthorized user, failed authorization, approved admin, column filtering, status validation and cross-origin denial. A 660-order fixture also checks each supported status across pages, filtering before pagination, omission of the filter, invalid/duplicate filter values, and authorization on filtered reads.
- `tests/database.test.ts`: **actual migration SQL and actual PostgreSQL RLS in PGlite**, with fixture auth schema and roles. Checks seed, database-price calculation and immutable snapshots, unknown products, constraints, anonymous denial, unauthorized authenticated denial, authorized status persistence, restricted column grants and singleton administrator. This is not hosted Supabase/PostgREST or real JWT validation.
- `browser-tests/shop.spec.ts`: real Chromium on desktop and mobile viewports, with mocked product/order HTTP responses. Catalog/images/fallback, total preview, validation, pending submission lock, delayed success, failed save/retry, product loading retry. Unauthenticated management API calls hit real Next handlers. Browser mocks do not prove database persistence.
- `browser-tests/admin-filter.spec.ts`: synthetic Auth and order HTTP mocks on desktop/mobile. Checks default Hebrew options, all-status results, matches beyond the initial page, pagination reset, returning to all, sign-out/re-entry defaults, stale success/error/pagination responses, loading/error/empty states, and status updates removing rows from the selected filter. No live database writes or real customer records are used.

## Real Supabase integration (requires setup)

Create the authorized administrator and one additional **unauthorized synthetic test user** through the Supabase dashboard. Keep public signups disabled. Set `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_OTHER_EMAIL`, `TEST_OTHER_PASSWORD` only in ignored `.env.local`, alongside the two app variables. Run:

```sh
npm run test:integration
```

The script uses real Supabase Auth and PostgREST with the public key; it checks product loading, rejected invalid orders, persisted current-price totals, denial of anonymous/unauthorized order reads and updates, and successful authorized status updates. It leaves one synthetic completed order. Run against a dedicated assessment/test project without concurrent product-price changes. Do not enable this script in public CI with credentials.

**Hosted Supabase integration and the complete deployed order flow remain unperformed until Supabase is configured.** The public Vercel shell was checked: storefront/login HTTP 200, unauthenticated management HTTP 403, unconfigured products HTTP 503. See README for recorded local results.

## Deployed manual checklist

- [ ] Open the public Vercel URL on desktop and mobile. Verify Hebrew/RTL, all 10 products, distinct photos, descriptions and the proposed ILS prices. Confirm `/api/products` fetches Supabase data. Temporarily change a price in Supabase and refresh to demonstrate database-backed loading; restore it afterward.
- [ ] Block one image in DevTools; verify the named coffee placeholder appears.
- [ ] Select a product, quantities 1 and 100, and verify the total. Try 0, 101 and a fractional quantity; verify rejection. Try whitespace-only first/last names/address, non-Gmail or `gmail.com.evil`, and malformed phone digits; verify rejection.
- [ ] Submit synthetic details (`בדיקה`, `סינתטית`, `כתובת בדיקה 1`, `assessment.synthetic@gmail.com`, `0500000000`). A padded mixed-case Gmail domain should normalize. Confirm the pending control disables and rapid repeat clicks do not send another request. Verify no payment details are requested.
- [ ] Verify success occurs only after HTTP 201. Confirm the new database row in Supabase: product FK, quantity, normalized customer fields, string phone with leading zero, `unit_price_agorot`, exact `total_agorot`, timestamp and `new` status. Change product price and confirm the saved order snapshot stays unchanged; restore price.
- [ ] Replay an order POST with a non-existent product, invalid quantity and fake `unit_price_agorot`/`total_agorot` fields. Invalid input must fail; supplied money/status fields must never affect saved values.
- [ ] Open `/admin`, log in with the explicitly authorized account, and verify newest orders first, all customer fields, product, quantity, saved prices and Jerusalem-local time. Verify loading/error/empty states.
- [ ] Verify `סינון לפי סטטוס` initially selects `הכול`. Select each existing status and confirm the request includes `status=new`, `status=in_progress`, or `status=completed` and `offset=0`. Load more and verify the same status with the next offset; returning to `הכול` must omit `status` and reset to offset zero. Quickly switch filters under network throttling; only the latest selection may determine rows or errors. Check an empty matching result separately from a failed request. Use a test dataset for multi-page checks; do not populate or modify production data just to test pagination.
- [ ] Change status to `בטיפול` then `הושלמה`; refresh and sign in again to confirm persistence. Verify failure feedback by blocking the PATCH request.
- [ ] Sign out and confirm the order table disappears. Refresh requires login because sessions are held only in memory.
- [ ] Without a token, call GET and PATCH `/api/admin/orders`: expect 403. With a valid unauthorized user's bearer token, expect 403 too. Never publish or paste that token into transcripts.
- [ ] Run `npm run test:integration` to check **direct Supabase API** access: anonymous users must be denied; an unauthorized authenticated user must see no orders and change no rows. Only the approved administrator can read/update statuses, and even that user cannot edit prices/customer fields. A hidden admin link alone is not an authorization check.
- [ ] Record the public URL, GitHub URL, test results and outstanding limitations in the submission. Include complete conversations with every AI tool used, with secrets/customer data excluded from the start.
