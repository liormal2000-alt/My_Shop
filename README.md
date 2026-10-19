# My_Shop — רובע קפה

A Hebrew RTL coffee storefront built with Next.js App Router, React, TypeScript, plain CSS and Supabase. Single-product order requests; no online payments.

**Live preview:** https://rova-coffee.vercel.app · **Repository:** https://github.com/liormal2000-alt/My_Shop

The deployed storefront shell and administrator login are reachable. **Supabase is not configured yet: products return HTTP 503, and orders cannot be placed.** Follow setup below to activate the database-backed application. Do not submit this as a fully functioning order site until that step and hosted verification are complete.

## What is implemented

- Responsive catalog fetched from Supabase, with ten seeded products at the requested prices, ten local Pexels images and named image fallbacks.
- Quantity 1–100, live total preview, browser/server validation, normalized Gmail-only email, required trimmed names/address and exactly ten ASCII phone digits stored as text.
- A database function reads the current product price and atomically saves integer-agorot price/total snapshots. Client-supplied prices/statuses are discarded. Success appears only after confirmed insertion; pending submissions are locked.
- Supabase password login at `/admin`, one explicitly authorized administrator, newest-first order table with customer/product/pricing details, load-more pagination, sign-out, and persisted Hebrew statuses: חדשה / בטיפול / הושלמה.
- Administrator status filtering defaults to `הכול`, uses the existing Hebrew status labels, filters in Supabase before pagination, resets to page one on selection changes, and ignores stale responses. Status updates within a filter reload page one to keep pagination consistent. Invalid API filter values return HTTP 400; administrator authorization is unchanged.
- RLS, restrictive table/column grants, database constraints, reproducible migration+seed, automated checks and a deployed manual checklist.

## Setup (fastest path)

Requires Node.js 22+ (Node 24 used here), npm, a Supabase project and a Vercel account. The original GitHub remote is `https://github.com/liormal2000-alt/My_Shop`.

1. In a new Supabase project's **SQL Editor**, run the complete contents of [`supabase/migrations/202610190001_initial.sql`](supabase/migrations/202610190001_initial.sql). This transaction creates tables, policies, grants, functions, indexes and all ten products. Run once on a fresh schema; it deliberately fails rather than overwriting existing tables. Keep subsequent changes in new timestamped migrations.
2. In Supabase **Authentication → Users**, create one administrator with an email and a strong password, confirming the account through the dashboard. Do not put its password in SQL, source or chat. In Auth settings disable **Allow new users to sign up**; no registration interface exists in this application.
3. Copy the account's user UUID and run the following in the SQL Editor, replacing the placeholder with that UUID (a UUID is not a password):

   ```sql
   insert into public.administrators (singleton, user_id)
   values (true, 'REPLACE_WITH_AUTH_USER_UUID'::uuid)
   on conflict (singleton) do update set user_id = excluded.user_id;
   ```

   Exactly one row/account can be authorized. Other authenticated users have no order access. To revoke administrator access: `delete from public.administrators;`. Authorizing a replacement immediately changes database authorization.

4. Copy `.env.example` to `.env.local`. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the project API settings. The latter accepts the public publishable key or legacy anon key. **Never use a secret/service-role key here.** Fill these locally or directly in Vercel; never paste secrets into AI chat. No privileged key is required by this application.
5. Run:

   ```sh
   npm ci
   npm run dev
   ```

   Visit `http://localhost:3000`; `/admin` is the administrator entry. Without configuration, the storefront shows a clear retryable error rather than fake runtime products.

The migration is also compatible with Supabase CLI migration workflows: after installing the CLI, run `supabase init` once to generate local configuration, `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase db push`. Use **either** SQL Editor on a new project **or** the CLI initially; do not apply the same migration twice. Never commit local credentials.

## Order notification email (Resend)

After a confirmed order save, the server sends a notification to the shop owner's fixed inbox, not to an address supplied by the customer. Configure these **server-only** variables in Vercel Production (and in ignored `.env.local` for local use), then redeploy:

- `RESEND_API_KEY`: a Resend API key with email sending permission. Never prefix it with `NEXT_PUBLIC_`, commit it, or paste it into chat.
- `ORDER_NOTIFICATION_EMAIL`: the exact email address associated with your Resend account while using the test sender.

The sender is `Rova Coffee <onboarding@resend.dev>`. This recipient restriction belongs to the `resend.dev` testing sender, not to the free plan in general: https://resend.com/docs/knowledge-base/403-error-resend-dev-domain. Sending customer confirmations to arbitrary addresses requires a verified sending domain and updating the sender.

The send attempt is awaited with an eight-second timeout. Resend's returned `{ error }` is checked, and an order-specific idempotency key prevents duplicate notifications for the same order within Resend's idempotency window. The email contains only the order UUID and a link to the protected administrator page; no customer details or raw provider errors are logged. Search Vercel logs for `order_email_accepted`, `order_email_configuration_missing`, `order_email_provider_rejected`, or `order_email_request_failed`. Acceptance by Resend does not prove inbox delivery; check Resend's email activity and the destination inbox/spam folder.

If email configuration is missing or the provider fails, the saved order still returns HTTP 201 to prevent retrying an already saved order. Email is best effort with no durable retry queue; use the administrator page as the order source of truth. For an end-to-end check, place one synthetic order after deployment, confirm it was saved, then inspect Resend activity and the configured inbox. Do not expose credentials or customer records in screenshots or logs.

## Vercel deployment

1. An initial Vercel deployment already exists as `rova-coffee` at the URL above. Open that project in your Vercel dashboard. For a fresh deployment instead, import `liormal2000-alt/My_Shop` under **Add New → Project**. Select the repository root and the detected **Next.js** preset; use Node 24, `npm ci`, and `npm run build`.
2. Add the two public Supabase variables from `.env.example` to **Production** and **Preview** as needed. Do not add the optional integration passwords to Vercel. Set variables **before building** because `NEXT_PUBLIC_*` values are bundled at build time. Redeploy after changing them.
3. Deploy. In Supabase Auth URL configuration set the Site URL to the HTTPS production URL. This password-only flow does not need an auth callback route; configure redirect allowlists if adding recovery/invites later.
4. Make sure the assessment URL is publicly accessible (Vercel deployment protection must not block the assessor). Run the deployed checklist in [`docs/VERIFICATION.md`](docs/VERIFICATION.md), including the real Supabase integration script. Submit the public URL and GitHub URL.

CLI alternative after authenticating locally: `npx vercel login`, `npx vercel link`, configure the same project environment variables in Vercel, then `npx vercel --prod`. Login through the browser, never share tokens in chat.

## Verification and current delivery state

- `npm test`: **85 passed** (validation, mock API authorization/filter pagination, mock Resend notification checks and embedded PostgreSQL migration/RLS checks).
- `npm run typecheck`: passed.
- `npm run build`: final production build passed (Next.js 16.4.2).
- `npm run test:browser`: **20 passed**, desktop and mobile Chromium, with mocked catalog/order/Auth responses. Includes administrator status-filter pagination and stale-response checks. See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) for commands and scope.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Vercel deployment verified **Ready**. The production alias is publicly reachable: `/` and `/admin` return HTTP 200; unauthenticated `/api/admin/orders` returns HTTP 403; `/api/products` returns HTTP 503 until configured. The individual deployment URL has Vercel authentication protection; use the public production alias above.
- Hosted Supabase migration, real Supabase integration and working live orders are **not yet performed**: no Supabase project configuration was available. No database/customer data or credentials are fabricated.
- GitHub is configured as the project remote, and Vercel confirms that the same repository is connected to `rova-coffee`. The included GitHub Actions workflow runs type checks, database/unit tests, a production build and browser tests without secrets.

The SQL/RLS suite uses PGlite's actual PostgreSQL engine with a fixture `auth.uid()`/roles. Mock API/browser tests are explicitly labeled. These results **do not claim verification of hosted Supabase policies or real JWT behavior**. Run `npm run test:integration` after filling the optional test-account variables locally; it creates one synthetic order and checks real Auth/PostgREST/RLS without service credentials.

## Decisions and limits

- Money is integer agorot throughout storage and trusted calculations; display divides only for formatting. The order RPC exposes no price/total/status parameters and returns only the order UUID.
- `is_admin()` uses an inaccessible singleton authorization table, never a user-editable profile or a blanket authenticated-user check. Every management API operation verifies the token with Supabase Auth and checks authorization; RLS enforces it again on direct API calls. Only the `status` column can be updated by the administrator.
- Password sessions are memory-only, so page refresh asks for login again. There is no public signup, password-recovery flow, payment processing, inventory or delivery charge calculation.
- The public order RPC necessarily permits order requests with validated synthetic/real form data; it has no CAPTCHA or distributed abuse rate limiter. An HTTP-only limiter would not cover direct Supabase RPC calls. Add database-enforced throttling or a server-only CAPTCHA-verified insert path before broad public promotion.
- The pending lock prevents duplicate in-flight clicks, but is not cross-tab/network-retry idempotency. An ambiguous network failure could have saved an order; a retry may create another. Add persisted idempotency keys next.
- Product photos are illustrative, locally stored, licensed Pexels assets; sources and usage restrictions are in [`docs/IMAGE_SOURCES.md`](docs/IMAGE_SOURCES.md). Font loading has an Arial fallback.
- Pagination loads 200 orders at a time. Refresh returns to the newest batch; for heavy concurrent ordering use cursor pagination. No customer data is intentionally logged, and no service-role credentials are used.

With one more hour: first configure Supabase and complete hosted verification, then add durable idempotency and abuse protection, administrator session-expiry handling/MFA, and cursor pagination/accessibility refinements.

**Assessment submission reminder:** include the complete conversations with all AI tools used, plus repository URL, public deployment URL, verification results and outstanding limitations. Keep credentials out of source, logs and shared conversations from the beginning.
