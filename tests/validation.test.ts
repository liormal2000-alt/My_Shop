import { describe, it, expect, vi } from "vitest";
import { orderSchema } from "../src/lib/validation";
import { saveOrder } from "../src/lib/order-service";
const valid = {
  product_id: 1,
  quantity: 2,
  first_name: " Test ",
  last_name: " Customer ",
  street_address: " Test 1 ",
  email: "  Demo@GMAIL.COM \n",
  phone: "0501234567",
};
describe("customer validation", () => {
  it("trims customer fields, normalizes Gmail and preserves leading zeroes", () => {
    expect(orderSchema.parse(valid)).toMatchObject({
      first_name: "Test",
      last_name: "Customer",
      street_address: "Test 1",
      email: "demo@gmail.com",
      phone: "0501234567",
    });
  });
  for (const field of ["first_name", "last_name", "street_address"])
    for (const value of ["", "  \t\n ", "\u00a0"])
      it(`rejects blank ${field} ${JSON.stringify(value)}`, () =>
        expect(
          orderSchema.safeParse({ ...valid, [field]: value }).success,
        ).toBe(false));
  for (const email of [
    "x@yahoo.com",
    "x@gmail.com.evil",
    "x@sub.gmail.com",
    "x@@gmail.com",
    "x y@gmail.com",
    "x @gmail.com",
    "@gmail.com",
    "x..y@gmail.com",
    "x@gmail.com\nx@gmail.com",
  ])
    it(`rejects email ${email}`, () =>
      expect(orderSchema.safeParse({ ...valid, email }).success).toBe(false));
  for (const phone of [
    "501234567",
    "05012345678",
    "050-1234567",
    "050 1234567",
    " 0501234567",
    "٠٥٠١٢٣٤٥٦٧",
    "０５０１２３４５６７",
    "0501234567\n",
  ])
    it(`rejects phone ${JSON.stringify(phone)}`, () =>
      expect(orderSchema.safeParse({ ...valid, phone }).success).toBe(false));
  for (const quantity of [0, 101, -1, 1.5, "2", null, NaN])
    it(`rejects quantity ${quantity}`, () =>
      expect(orderSchema.safeParse({ ...valid, quantity }).success).toBe(
        false,
      ));
  for (const quantity of [1, 100])
    it(`accepts quantity ${quantity}`, () =>
      expect(orderSchema.safeParse({ ...valid, quantity }).success).toBe(true));
});
describe("order service (mock RPC, not Supabase integration)", () => {
  it("does not pass client prices, totals, status or extra customer data to RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "saved-id", error: null });
    const result = await saveOrder(
      { rpc },
      { ...valid, unit_price_agorot: 1, total_agorot: 1, status: "completed" },
    );
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ order_id: "saved-id" });
    expect(rpc).toHaveBeenCalledWith("place_order", {
      p_product_id: 1,
      p_quantity: 2,
      p_first_name: "Test",
      p_last_name: "Customer",
      p_street_address: "Test 1",
      p_email: "demo@gmail.com",
      p_phone: "0501234567",
    });
  });
  it("never reports success when database rejects product or save", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "Unknown product" } });
    expect(
      (await saveOrder({ rpc }, { ...valid, product_id: 999999 })).status,
    ).toBe(400);
  });
  it("rejects invalid input before calling database", async () => {
    const rpc = vi.fn();
    expect((await saveOrder({ rpc }, { ...valid, quantity: 0 })).status).toBe(
      400,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
