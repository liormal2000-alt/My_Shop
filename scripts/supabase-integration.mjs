// Opt-in REAL Supabase check with synthetic test accounts only.
// Leaves one clearly synthetic completed order for persistence inspection.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "TEST_ADMIN_EMAIL",
  "TEST_ADMIN_PASSWORD",
  "TEST_OTHER_EMAIL",
  "TEST_OTHER_PASSWORD",
];
if (required.some((k) => !process.env[k]))
  throw Error(
    "Set integration variables locally in .env.local. Never paste credentials into chat.",
  );
const make = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const anon = make(),
  admin = make(),
  other = make();
const check = ({ error }) =>
  assert.equal(error, null, "Supabase request failed");
try {
  check(
    await admin.auth.signInWithPassword({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    }),
  );
  check(
    await other.auth.signInWithPassword({
      email: process.env.TEST_OTHER_EMAIL,
      password: process.env.TEST_OTHER_PASSWORD,
    }),
  );
  const a = await admin.rpc("is_admin");
  check(a);
  assert.equal(a.data, true);
  const b = await other.rpc("is_admin");
  check(b);
  assert.equal(b.data, false);
  const products = await anon.from("products").select("*").order("id");
  check(products);
  assert.equal(products.data.length, 10);
  const args = {
    p_product_id: products.data[0].id,
    p_quantity: 2,
    p_first_name: "בדיקה",
    p_last_name: "סינתטית",
    p_street_address: "כתובת בדיקה 1",
    p_email: "assessment.synthetic@gmail.com",
    p_phone: "0500000000",
  };
  for (const change of [
    { p_quantity: 0 },
    { p_quantity: 101 },
    { p_product_id: 2147483647 },
    { p_first_name: " " },
    { p_email: "bad@example.com" },
    { p_phone: "050-000000" },
  ])
    assert.ok(
      (await anon.rpc("place_order", { ...args, ...change })).error,
      "Invalid order must fail",
    );
  const placed = await anon.rpc("place_order", args);
  check(placed);
  assert.ok(placed.data);
  const id = placed.data;
  for (const db of [anon, other]) {
    const read = await db.from("orders").select("id").eq("id", id);
    assert.ok(read.error || read.data.length === 0);
    const write = await db
      .from("orders")
      .update({ status: "completed" })
      .eq("id", id)
      .select("id");
    assert.ok(write.error || write.data.length === 0);
    assert.ok((await db.from("orders").insert({ product_id: 1 })).error);
  }
  const saved = await admin.from("orders").select("*").eq("id", id).single();
  check(saved);
  assert.equal(saved.data.phone, "0500000000");
  assert.equal(saved.data.unit_price_agorot, products.data[0].price_agorot);
  assert.equal(saved.data.total_agorot, products.data[0].price_agorot * 2);
  assert.equal(saved.data.status, "new");
  for (const status of ["in_progress", "completed"]) {
    check(await admin.from("orders").update({ status }).eq("id", id));
    const read = await admin
      .from("orders")
      .select("status")
      .eq("id", id)
      .single();
    check(read);
    assert.equal(read.data.status, status);
  }
  assert.ok(
    (await admin.from("orders").update({ total_agorot: 1 }).eq("id", id)).error,
  );
  console.log(
    "PASS: real Supabase products, validation, saved prices, unauthorized reads/updates, authorized status persistence. One synthetic completed order remains.",
  );
} finally {
  await Promise.all([admin.auth.signOut(), other.auth.signOut()]);
}
