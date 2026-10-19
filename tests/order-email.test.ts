import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  construct: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    constructor(key: string) {
      mocks.construct(key);
    }
    emails = { send: mocks.send };
  },
}));
vi.mock("@/lib/server", () => ({
  database: () => ({ rpc: mocks.rpc }),
  sameOrigin: (request: Request) =>
    !request.headers.get("origin") ||
    request.headers.get("origin") === new URL(request.url).origin,
}));
import { notifyNewOrder } from "../src/lib/order-email";
import { POST } from "../src/app/api/orders/route";

const id = "11111111-1111-4111-8111-111111111111";
const input = {
  product_id: 1,
  quantity: 2,
  first_name: "Synthetic",
  last_name: "Customer",
  street_address: "Test address 1",
  email: "synthetic.customer@gmail.com",
  phone: "0500000000",
};
function request(body: unknown = input) {
  return new Request("https://shop.test/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://shop.test",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "synthetic-key-not-real");
  vi.stubEnv("ORDER_NOTIFICATION_EMAIL", " synthetic.owner@example.test ");
  mocks.send.mockResolvedValue({
    data: { id: "synthetic-email-id" },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: id, error: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("order notification (mock Resend, no real messages)", () => {
  it("uses only the configured owner recipient, a test sender and a saved-order idempotency key", async () => {
    expect(await notifyNewOrder(id)).toBe("accepted");
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Rova Coffee <onboarding@resend.dev>",
        to: ["synthetic.owner@example.test"],
        text: expect.stringContaining(id),
      }),
      {
        idempotencyKey: `order-notification/${id}`,
        signal: expect.any(AbortSignal),
      },
    );
  });
  for (const name of ["RESEND_API_KEY", "ORDER_NOTIFICATION_EMAIL"])
    it(`handles missing ${name} without constructing a client or throwing`, async () => {
      vi.stubEnv(name, "");
      expect(await notifyNewOrder(id)).toBe("not_configured");
      expect(mocks.construct).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    });
  it("rejects an invalid recipient without sending", async () => {
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "not-an-email");
    expect(await notifyNewOrder(id)).toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects an invalid saved ID without sending", async () => {
    expect(await notifyNewOrder("<script>not-a-uuid</script>")).toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("handles resolved Resend errors and logs only an allowed error identifier", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "Private provider detail: synthetic.owner@example.test",
      },
    });
    expect(await notifyNewOrder(id)).toBe("failed");
    expect(console.error).toHaveBeenCalledWith(
      "order_email_provider_rejected",
      { reason: "validation_error" },
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "Private provider detail",
    );
  });
  it("does not log arbitrary provider error names or messages", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "synthetic.owner@example.test", message: "private-token" },
    });
    expect(await notifyNewOrder(id)).toBe("failed");
    expect(console.error).toHaveBeenCalledWith(
      "order_email_provider_rejected",
      { reason: "provider_error" },
    );
  });
  it("handles network failures/timeouts without exposing exception text", async () => {
    mocks.send.mockRejectedValue(
      new Error("Private credential or customer data"),
    );
    expect(await notifyNewOrder(id)).toBe("failed");
    expect(console.error).toHaveBeenCalledWith("order_email_request_failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "Private credential",
    );
  });
  it("does not claim acceptance without an email ID", async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    expect(await notifyNewOrder(id)).toBe("failed");
  });
});

describe("checkout notification sequencing (mock database and Resend)", () => {
  it("sends only after confirmed database persistence and ignores customer-supplied recipients", async () => {
    const response = await POST(
      request({
        ...input,
        to: "arbitrary@example.test",
        recipientEmail: "arbitrary@example.test",
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ order_id: id });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0],
    );
    expect(mocks.send.mock.calls[0][0].to).toEqual([
      "synthetic.owner@example.test",
    ]);
    expect(JSON.stringify(mocks.send.mock.calls)).not.toContain(input.email);
  });
  it("waits for the send attempt before returning the saved order response", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let responded = false;
    const response = POST(request()).then((value) => {
      responded = true;
      return value;
    });
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(responded).toBe(false);
    finish({ data: { id: "synthetic-email-id" }, error: null });
    expect((await response).status).toBe(201);
  });
  it("does not send or log customer data for invalid input", async () => {
    expect((await POST(request({ ...input, quantity: 0 }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send when the database rejects the order", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Rejected" } });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send when the database is unavailable", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("preserves saved-order success when Resend rejects or throws", async () => {
    for (const failsByThrowing of [false, true]) {
      if (failsByThrowing)
        mocks.send.mockRejectedValueOnce(new Error("offline"));
      else
        mocks.send.mockResolvedValueOnce({
          data: null,
          error: { name: "validation_error", message: "restricted" },
        });
      const response = await POST(request());
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ order_id: id });
    }
  });
  it("keeps checkout working without email configuration", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await POST(request())).status).toBe(201);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
