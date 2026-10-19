import { orderSchema } from "./validation";

type OrderDatabase = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export async function saveOrder(db: OrderDatabase, input: unknown) {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success)
    return { status: 400, body: { error: parsed.error.issues[0].message } };
  const args = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [`p_${k}`, v]),
  );
  const { data, error } = await db.rpc("place_order", args);
  if (error || !data)
    return {
      status: 400,
      body: { error: "לא ניתן לשמור את ההזמנה. בדקו את הפרטים ונסו שוב." },
    };
  return { status: 201, body: { order_id: data } };
}
