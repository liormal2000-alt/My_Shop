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
  const result = await saveOrder(database(), input);

  if (result.status === 201) {
    // הדפסת לוג ל-Vercel כדי לוודא שגענו לכאן
    console.log("Order saved successfully! Preparing to send email. Input was:", JSON.stringify(input));

    // שליפת המייל מכל שם אפשרי שקיים ב-input
    const bodyObj = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};
    const recipientEmail = (bodyObj.email || bodyObj.customer_email || bodyObj.customerEmail) as string | undefined;

    if (recipientEmail) {
      console.log("Sending email to:", recipientEmail);

      resend.emails.send({
        from: 'My Shop <onboarding@resend.dev>',
        to: [recipientEmail],
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
      }).then((res) => {
        console.log("Resend response:", res);
      }).catch((err) => {
        console.error("Resend error:", err);
      });
    } else {
      console.warn("Could not find email field in input object!");
    }
  }

    return Response.json(result.body, { status: result.status });
  } catch {
      return Response.json(
        { error: "השירות אינו זמין כרגע. נסו שוב מאוחר יותר." },
        { status: 503 },
      );
    }
  }