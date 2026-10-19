import { test, expect, type Page, type Route } from "@playwright/test";
import { statusLabels } from "../src/lib/validation";

// Synthetic auth and HTTP fixtures only: no live Supabase calls or customer data.
const statuses = Object.keys(statusLabels) as (keyof typeof statusLabels)[];
const orders = Array.from({ length: 660 }, (_, i) => ({
  id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
  first_name: "בדיקה",
  last_name: `סינתטית ${i}`,
  street_address: "כתובת בדיקה 1",
  email: "synthetic@gmail.com",
  phone: "0500000000",
  quantity: 1,
  unit_price_agorot: 5500,
  total_agorot: 5500,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 660 - i)).toISOString(),
  status: statuses[i % 3],
  products: { name: "מוצר בדיקה" },
}));
type Order = (typeof orders)[number];
type Query = { status: string | null; offset: number };
async function setup(
  page: Page,
  handler: (route: Route, query: Query) => Promise<unknown>,
) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    { alg: "HS256", typ: "JWT" },
    { sub: orders[0].id, exp },
    "synthetic-signature",
  ]
    .map((part) =>
      Buffer.from(
        typeof part === "string" ? part : JSON.stringify(part),
      ).toString("base64url"),
    )
    .join(".");
  await page.route("https://synthetic.supabase.co/auth/v1/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/logout"))
      return route.fulfill({ status: 204 });
    return route.fulfill({
      json: {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "synthetic-refresh-token",
        user: {
          id: orders[0].id,
          aud: "authenticated",
          role: "authenticated",
          email: "admin@example.test",
        },
      },
    });
  });
  await page.route("**/api/admin/orders*", (route) => {
    const url = new URL(route.request().url());
    return handler(route, {
      status: url.searchParams.get("status"),
      offset: Number(url.searchParams.get("offset") || 0),
    });
  });
  await page.goto("/admin");
  await login(page);
}
async function login(page: Page) {
  await page.getByLabel("אימייל", { exact: true }).fill("admin@example.test");
  await page.getByLabel("סיסמה", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "כניסה לניהול ההזמנות" }).click();
  await expect(
    page.getByRole("heading", { name: "ניהול הזמנות" }),
  ).toBeVisible();
}
function result(dataset: Order[], query: Query) {
  return dataset
    .filter((row) => !query.status || row.status === query.status)
    .slice(query.offset, query.offset + 200);
}
const filter = (page: Page) => page.getByLabel("סינון לפי סטטוס");
const rows = (page: Page) => page.locator("tbody tr");
async function expectStatuses(page: Page, status: string) {
  const values = await page
    .locator("tbody select")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLSelectElement).value),
    );
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((value) => value === status)).toBe(true);
}

test("defaults to all, filters beyond loaded pages, resets pagination and resets on re-entry", async ({
  page,
}) => {
  test.setTimeout(90000);
  const requests: Query[] = [];
  await setup(page, async (route, query) => {
    requests.push(query);
    await route.fulfill({ json: { orders: result(orders, query) } });
  });
  await expect(filter(page)).toHaveValue("");
  await expect(filter(page).locator("option")).toHaveText([
    "הכול",
    ...Object.values(statusLabels),
  ]);
  await expect(rows(page)).toHaveCount(200);
  expect(
    new Set(
      await page
        .locator("tbody select")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLSelectElement).value),
        ),
    ).size,
  ).toBe(3);
  await filter(page).selectOption("new");
  await expect(rows(page)).toHaveCount(200);
  await expectStatuses(page, "new");
  expect(requests.at(-1)).toEqual({ status: "new", offset: 0 });
  // This matching order is beyond the unfiltered first page.
  await expect(
    page.getByRole("cell", { name: "בדיקה סינתטית 597", exact: true }),
  ).toBeAttached();
  await page.getByRole("button", { name: "טעינת הזמנות נוספות" }).click();
  await expect(rows(page)).toHaveCount(220);
  expect(requests.at(-1)).toEqual({ status: "new", offset: 200 });
  await filter(page).selectOption("completed");
  await expect(rows(page)).toHaveCount(200);
  await expectStatuses(page, "completed");
  expect(requests.at(-1)).toEqual({ status: "completed", offset: 0 });
  await filter(page).selectOption("");
  await expect(rows(page)).toHaveCount(200);
  expect(requests.at(-1)).toEqual({ status: null, offset: 0 });
  await filter(page).selectOption("in_progress");
  await expectStatuses(page, "in_progress");
  await page.getByRole("button", { name: "התנתקות" }).click();
  await login(page);
  await expect(filter(page)).toHaveValue("");
  expect(requests.at(-1)).toEqual({ status: null, offset: 0 });
});

for (const oldResult of ["success", "error"] as const)
  test(`ignores stale ${oldResult} after switching filters; distinguishes loading, empty and error`, async ({
    page,
  }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let oldStarted = false,
      oldFinished = false;
    await setup(page, async (route, query) => {
      if (query.status === "new") {
        oldStarted = true;
        await gate;
        await route.fulfill(
          oldResult === "error"
            ? { status: 503, json: { error: "שגיאה ישנה" } }
            : { json: { orders: result(orders, query) } },
        );
        oldFinished = true;
        return;
      }
      if (query.status === "completed")
        return route.fulfill({ json: { orders: [] } });
      if (query.status === "in_progress")
        return route.fulfill({ status: 503, json: { error: "שגיאת בדיקה" } });
      await route.fulfill({ json: { orders: result(orders, query) } });
    });
    await filter(page).selectOption("new");
    await expect.poll(() => oldStarted).toBe(true);
    await expect(page.getByText("טוענים הזמנות…")).toBeVisible();
    await expect(page.getByText("אין הזמנות בסטטוס שנבחר.")).toHaveCount(0);
    await filter(page).selectOption("completed");
    await expect(page.getByText("אין הזמנות בסטטוס שנבחר.")).toBeVisible();
    release();
    await expect.poll(() => oldFinished).toBe(true);
    // Let the earlier fetch/body/state microtasks settle before checking it stayed empty.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(filter(page)).toHaveValue("completed");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
    await filter(page).selectOption("in_progress");
    await expect(page.locator('main [role="alert"]')).toHaveText("שגיאת בדיקה");
    await expect(page.getByText("אין הזמנות בסטטוס שנבחר.")).toHaveCount(0);
    await filter(page).selectOption("");
    await expect(rows(page)).toHaveCount(200);
  });

test("ignores a delayed pagination response after selecting a different filter", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false,
    finished = false;
  await setup(page, async (route, query) => {
    if (query.offset === 200) {
      started = true;
      await gate;
    }
    await route.fulfill({ json: { orders: result(orders, query) } });
    if (query.offset === 200) finished = true;
  });
  await page.getByRole("button", { name: "טעינת הזמנות נוספות" }).click();
  await expect.poll(() => started).toBe(true);
  await filter(page).selectOption("completed");
  await expect(rows(page)).toHaveCount(200);
  await expectStatuses(page, "completed");
  release();
  await expect.poll(() => finished).toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(rows(page)).toHaveCount(200);
  await expectStatuses(page, "completed");
});

test("status update refreshes the filtered first page and removes the non-matching row", async ({
  page,
}) => {
  let dataset = orders.slice();
  const reads: Query[] = [];
  await setup(page, async (route, query) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      dataset = dataset.map((row) =>
        row.id === body.id ? { ...row, status: body.status } : row,
      );
      return route.fulfill({ json: { id: body.id, status: body.status } });
    }
    reads.push(query);
    await route.fulfill({ json: { orders: result(dataset, query) } });
  });
  await filter(page).selectOption("new");
  await expectStatuses(page, "new");
  await page.locator("tbody select").first().selectOption("completed");
  await expect(page.getByText("הסטטוס עודכן ונשמר בהצלחה.")).toBeVisible();
  await expect(rows(page)).toHaveCount(200);
  await expectStatuses(page, "new");
  await expect(
    page.getByRole("cell", { name: "בדיקה סינתטית 0", exact: true }),
  ).toHaveCount(0);
  expect(reads.at(-1)).toEqual({ status: "new", offset: 0 });
});
