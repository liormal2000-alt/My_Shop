import { database, sameOrigin } from "@/lib/server";
import { saveOrder } from "@/lib/order-service";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    // שליחת ההזמנה למסד הנתונים
    const result = await saveOrder(database(), input);

    // אם ההזמנה נוצרה בהצלחה (סטטוס 201), נשלח מייל אישור
    if (result.status === 201 && input && typeof input === "object" && "email" in input) {
      const customerEmail = (input as { email: string }).email;

      // שליחת מייל רקע (לא עוצרים את תגובת הלקוח אם המייל מתעכב)
      resend.emails.send({
        from: 'My Shop <onboarding@resend.dev>',
        to: [customerEmail],
        subject: 'אישור הזמנה - רובע קפה ☕',
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
            <h2>תודה רבה על הזמנתך מרובע קפה!</h2>
            <p>קיבלנו את הזמנתך והיא בטיפול.</p>
            <p>מספר הזמנה: <strong>${(result.body as { order_id?: string }).order_id || ''}</strong></p>
            <hr />
            <p>נתראה בקרוב!</p>
          </div>
        `,
      }).catch((err) => console.error("Failed to send email:", err));
    }

    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json(
      { error: "השירות אינו זמין כרגע. נסו שוב מאוחר יותר." },
      { status: 503 },
    );
  }
}