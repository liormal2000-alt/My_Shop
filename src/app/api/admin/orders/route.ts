import { administrator, sameOrigin } from "@/lib/server";
import { statusSchema } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const db = await administrator(request);
    if (!db)
      return Response.json(
        { error: "אין הרשאה לצפייה בהזמנות" },
        { status: 403 },
      );
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
      return Response.json({ error: "עמוד לא תקין" }, { status: 400 });
    const { data, error } = await db
      .from("orders")
      .select("*,products(name)")
      .order("created_at", { ascending: false })
      .range(offset, offset + 199);
    if (error) throw error;
    return Response.json(
      { orders: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "טעינת ההזמנות נכשלה" }, { status: 503 });
  }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "אין הרשאה" }, { status: 403 });
  try {
    const db = await administrator(request);
    if (!db)
      return Response.json(
        { error: "אין הרשאה לעדכון הזמנות" },
        { status: 403 },
      );
    const body = await request.json();
    const status = statusSchema.safeParse(body.status);
    if (
      !status.success ||
      typeof body.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.id)
    )
      return Response.json({ error: "עדכון לא תקין" }, { status: 400 });
    const { data, error } = await db
      .from("orders")
      .update({ status: status.data })
      .eq("id", body.id)
      .select("id,status")
      .single();
    if (error || !data)
      return Response.json({ error: "עדכון הסטטוס נכשל" }, { status: 400 });
    return Response.json(data);
  } catch {
    return Response.json({ error: "עדכון הסטטוס נכשל" }, { status: 503 });
  }
}
