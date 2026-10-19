import { database } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { data, error } = await database()
      .from("products")
      .select("id,name,description,price_agorot,image_path")
      .order("id");
    if (error) throw error;
    return Response.json(
      { products: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "לא ניתן לטעון את המוצרים כרגע. נסו שוב בעוד רגע." },
      { status: 503 },
    );
  }
}
