import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.database }));
import { GET, PATCH } from "../src/app/api/admin/orders/route";
const id = "11111111-1111-4111-8111-111111111111";
function req(method = "GET", body?: unknown, token = true) {
  return new Request("https://shop.test/api/admin/orders", {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer test-token" } : {}),
      "Content-Type": "application/json",
      Origin: "https://shop.test",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
  mocks.database.mockReturnValue({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
describe("admin HTTP authorization (mock Supabase)", () => {
  it("denies missing token on reads and writes before database access", async () => {
    expect((await GET(req("GET", undefined, false))).status).toBe(403);
    expect(
      (await PATCH(req("PATCH", { id, status: "completed" }, false))).status,
    ).toBe(403);
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("denies invalid token", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    });
    expect((await GET(req())).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("denies authenticated non-admin on every read and write", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await GET(req())).status).toBe(403);
    expect(
      (await PATCH(req("PATCH", { id, status: "completed" }))).status,
    ).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("denies authorization RPC failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect((await GET(req())).status).toBe(403);
  });
  it("allows approved admin list with no-store", async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ range });
    mocks.from.mockReturnValue({ select: () => ({ order }) });
    const r = await GET(req());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ orders: [] });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
  it("updates only status after explicit authorization", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id, status: "completed" }, error: null });
    const update = vi
      .fn()
      .mockReturnValue({ eq: () => ({ select: () => ({ single }) }) });
    mocks.from.mockReturnValue({ update });
    const r = await PATCH(
      req("PATCH", { id, status: "completed", total_agorot: 1 }),
    );
    expect(r.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: "completed" });
  });
  it("rejects unknown status before update", async () => {
    expect((await PATCH(req("PATCH", { id, status: "invalid" }))).status).toBe(
      400,
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects cross origin status request", async () => {
    const r = new Request("https://shop.test/api/admin/orders", {
      method: "PATCH",
      headers: { Origin: "https://evil.test" },
    });
    expect((await PATCH(r)).status).toBe(403);
    expect(mocks.database).not.toHaveBeenCalled();
  });
});
