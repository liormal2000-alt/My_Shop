import { test, expect } from "@playwright/test";
// HTTP mocks exercise the UI only; they do not establish Supabase persistence.
const products = [
  "פולי קפה קלויים",
  "קפה טחון",
  "תערובת קפה באריזה",
  "מארז קפסולות צבעוניות",
  "מארז קפסולות כסופות",
  "מקינטה",
  "פרנץ׳ פרס",
  "מטחנת קפה ידנית",
  "מתקן להכנת קפה פילטר",
  "ספל קרמיקה לקפה",
].map((name, i) => ({
  id: i + 1,
  name,
  description: "תיאור סינתטי לבדיקת הממשק",
  price_agorot: [5500, 4500, 5900, 3500, 3500, 12000, 9500, 15000, 8900, 3900][
    i
  ],
  image_path: `/products/${i + 1}.jpg`,
}));
async function catalog(page: import("@playwright/test").Page) {
  await page.route("**/api/products", (route) =>
    route.fulfill({ json: { products } }),
  );
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(10);
}
async function fill(page: import("@playwright/test").Page) {
  await page
    .locator(".product-card")
    .first()
    .getByRole("button", { name: "לבקשת הזמנה" })
    .click();
  await page.getByLabel("שם פרטי", { exact: true }).fill("בדיקה");
  await page.getByLabel("שם משפחה", { exact: true }).fill("סינתטית");
  await page.getByLabel("כתובת רחוב", { exact: true }).fill("כתובת בדיקה 1");
  await page.getByLabel("אימייל Gmail").fill(" Demo@GMAIL.COM ");
  await page.getByLabel("טלפון — 10 ספרות").fill("0500000000");
}
test("RTL catalog, ten different local images, mobile layout and fallback", async ({
  page,
}, testInfo) => {
  await catalog(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  for (const image of await page.locator(".product-picture img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/storefront-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.route("**/products/1.jpg", (route) => route.abort());
  await page.reload();
  await page.locator(".product-card").first().scrollIntoViewIfNeeded();
  await expect(page.locator(".image-fallback").first()).toBeVisible();
});
test("validates locally, calculates preview, prevents duplicate submits and awaits save", async ({
  page,
}) => {
  let submitted = 0;
  let payload: Record<string, unknown> = {};
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/orders", async (route) => {
    submitted++;
    payload = route.request().postDataJSON();
    await gate;
    await route.fulfill({ status: 201, json: { order_id: "synthetic-id" } });
  });
  await catalog(page);
  await fill(page);
  await page.getByLabel("כמות", { exact: true }).fill("2");
  await expect(page.locator(".total")).toContainText("110");
  await page.getByLabel("שם פרטי", { exact: true }).fill("   ");
  await page
    .getByRole("button", { name: "שליחת בקשת הזמנה", exact: true })
    .click();
  await expect(page.getByText("שדה חובה", { exact: true })).toBeVisible();
  expect(submitted).toBe(0);
  await page.getByLabel("שם פרטי", { exact: true }).fill("בדיקה");
  await page
    .getByRole("button", { name: "שליחת בקשת הזמנה", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "שומרים את ההזמנה…" }),
  ).toBeDisabled();
  await expect(page.getByText("איזה כיף, קפה בדרך.")).toHaveCount(0);
  await expect.poll(() => submitted).toBe(1);
  expect(payload.email).toBe("demo@gmail.com");
  expect(payload.phone).toBe("0500000000");
  expect(payload).not.toHaveProperty("total_agorot");
  release();
  await expect(page.getByText("איזה כיף, קפה בדרך.")).toBeVisible();
});
test("failed save shows error and allows retry without success", async ({
  page,
}) => {
  await page.route("**/api/orders", (route) =>
    route.fulfill({ status: 503, json: { error: "שגיאת בדיקה סינתטית" } }),
  );
  await catalog(page);
  await fill(page);
  await page
    .getByRole("button", { name: "שליחת בקשת הזמנה", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "שגיאת בדיקה סינתטית",
  );
  await expect(
    page.getByRole("button", { name: "שליחת בקשת הזמנה", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("איזה כיף, קפה בדרך.")).toHaveCount(0);
});
test("product loading failure is clear and retry succeeds", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/products", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 503, json: { error: "offline" } }
        : { json: { products } },
    );
  });
  await page.goto("/");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "לנסות שוב" }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
});
test("unauthenticated management API denies reads and updates", async ({
  request,
  page,
}) => {
  expect((await request.get("/api/admin/orders")).status()).toBe(403);
  expect(
    (
      await request.patch("/api/admin/orders", {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          status: "completed",
        },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "כניסת מנהל" })).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
});
