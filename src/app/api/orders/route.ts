import { database, sameOrigin } from "@/lib/server";
import { saveOrder } from "@/lib/order-service";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "הבקשה נדחתה" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 10000)
    return Response.json({ error: "בקשה גדולה מדי" }, { status: 413 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  try {
    const result = await saveOrder(database(), input);
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json(
      { error: "השירות אינו זמין כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }
}
