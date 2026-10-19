import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

// Actual migration and PostgreSQL RLS in embedded PostgreSQL. Auth schema/roles
// are test fixtures. This is NOT a check against hosted Supabase/PostgREST.
const db = new PGlite();
const admin = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
let orderId: string;
async function asRole<T>(
  role: string,
  uid: string,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [
      uid,
    ]);
    return tx.query<T>(sql, params);
  });
}
beforeAll(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${admin}'),('${other}');`);
  await db.exec(
    readFileSync("supabase/migrations/202610190001_initial.sql", "utf8"),
  );
  await db.query("insert into public.administrators(user_id) values ($1)", [
    admin,
  ]);
});
afterAll(async () => {
  await db.close();
});
describe.sequential(
  "migration, constraints and RLS (embedded PostgreSQL)",
  () => {
    it("exposes exactly ten seeded products to anonymous callers", async () => {
      const r = await asRole<{ count: number }>(
        "anon",
        "",
        "select count(*)::int as count from public.products",
      );
      expect(r.rows[0].count).toBe(10);
    });
    it("anonymous order RPC uses current database price and returns only ID", async () => {
      await db.exec("update public.products set price_agorot=5700 where id=1");
      const result = await asRole<{ id: string }>(
        "anon",
        "",
        "select public.place_order(1,3,' Test ',' Customer ',' Test street 1 ',' DEMO@GMAIL.COM ','0501234567') as id",
      );
      orderId = result.rows[0].id;
      expect(orderId).toMatch(/^[0-9a-f-]{36}$/);
      const { rows } = await db.query<{
        unit_price_agorot: number;
        total_agorot: number;
        phone: string;
        email: string;
        status: string;
      }>("select * from public.orders where id=$1", [orderId]);
      expect(rows[0]).toMatchObject({
        unit_price_agorot: 5700,
        total_agorot: 17100,
        phone: "0501234567",
        email: "demo@gmail.com",
        status: "new",
      });
      await db.exec("update public.products set price_agorot=5500 where id=1");
      expect(
        (
          await db.query<{ total_agorot: number }>(
            "select total_agorot from public.orders where id=$1",
            [orderId],
          )
        ).rows[0].total_agorot,
      ).toBe(17100);
    });
    for (const qty of [0, 101, -1])
      it(`RPC rejects quantity ${qty}`, async () => {
        await expect(
          asRole(
            "anon",
            "",
            `select public.place_order(1,${qty},'Test','Customer','Test street','demo@gmail.com','0501234567')`,
          ),
        ).rejects.toThrow();
      });
    it("RPC rejects missing product", async () => {
      await expect(
        asRole(
          "anon",
          "",
          "select public.place_order(999999,1,'Test','Customer','Test street','demo@gmail.com','0501234567')",
        ),
      ).rejects.toThrow("Unknown product");
    });
    it("database rejects malformed fields through direct RPC", async () => {
      for (const args of [
        [" ", "Customer", "Street", "demo@gmail.com", "0501234567"],
        ["Test", "\t", "Street", "demo@gmail.com", "0501234567"],
        ["Test", "Customer", "Street", "demo@gmail.com.evil", "0501234567"],
        ["Test", "Customer", "Street", "demo@gmail.com", "050 1234567"],
      ]) {
        await expect(
          asRole(
            "anon",
            "",
            "select public.place_order(1,1,$1,$2,$3,$4,$5)",
            args,
          ),
        ).rejects.toThrow();
      }
    });
    it("anonymous callers cannot read, insert, or update orders", async () => {
      await expect(
        asRole("anon", "", "select * from public.orders"),
      ).rejects.toThrow("permission denied");
      await expect(
        asRole(
          "anon",
          "",
          "update public.orders set status='completed' where id=$1",
          [orderId],
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        asRole("anon", "", "insert into public.orders(product_id) values (1)"),
      ).rejects.toThrow("permission denied");
    });
    it("unapproved authenticated users cannot read or update any order", async () => {
      expect(
        (await asRole("authenticated", other, "select * from public.orders"))
          .rows,
      ).toEqual([]);
      expect(
        (
          await asRole(
            "authenticated",
            other,
            "update public.orders set status='completed' where id=$1 returning id",
            [orderId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await asRole<{ allowed: boolean }>(
            "authenticated",
            other,
            "select public.is_admin() as allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
    });
    it("authorized admin can read and persist all statuses", async () => {
      expect(
        (await asRole("authenticated", admin, "select * from public.orders"))
          .rows,
      ).toHaveLength(1);
      for (const status of ["in_progress", "completed", "new"]) {
        const result = await asRole<{ status: string }>(
          "authenticated",
          admin,
          "update public.orders set status=$1 where id=$2 returning status",
          [status, orderId],
        );
        expect(result.rows[0].status).toBe(status);
      }
    });
    it("even admin cannot change price, customer data, invalid status or authorize another user", async () => {
      await expect(
        asRole(
          "authenticated",
          admin,
          "update public.orders set total_agorot=1 where id=$1",
          [orderId],
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        asRole(
          "authenticated",
          admin,
          "update public.orders set first_name='Changed' where id=$1",
          [orderId],
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        asRole(
          "authenticated",
          admin,
          "update public.orders set status='invalid' where id=$1",
          [orderId],
        ),
      ).rejects.toThrow();
      await expect(
        asRole(
          "authenticated",
          other,
          "insert into public.administrators(user_id) values ($1)",
          [other],
        ),
      ).rejects.toThrow("permission denied");
    });
    it("only one administrator can be authorized", async () => {
      await expect(
        db.query("insert into public.administrators(user_id) values ($1)", [
          other,
        ]),
      ).rejects.toThrow();
    });
  },
);
