import "server-only";
import { Resend } from "resend";
import { z } from "zod";

const providerErrorNames = new Set([
  "validation_error",
  "rate_limit_exceeded",
  "invalid_api_key",
  "missing_api_key",
  "restricted_api_key",
  "application_error",
  "internal_server_error",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);

// Notification recipient is controlled by the server, never the checkout form.
// No customer details, keys, provider messages, or email addresses are logged.
export async function notifyNewOrder(orderId: unknown) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipient = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  if (!apiKey || !recipient) {
    console.warn("order_email_configuration_missing");
    return "not_configured" as const;
  }
  const address = z.email().safeParse(recipient);
  const id = z.uuid().safeParse(orderId);
  if (!address.success || !id.success) {
    console.error("order_email_configuration_or_id_invalid");
    return "failed" as const;
  }
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        from: "Rova Coffee <onboarding@resend.dev>",
        to: [address.data],
        subject: "בקשת הזמנה חדשה — רובע קפה ☕",
        text: [
          "בקשת הזמנה חדשה נשמרה ברובע קפה.",
          `מספר ההזמנה: ${id.data}`,
          "לצפייה בפרטים ולטיפול בהזמנה יש להתחבר לאזור הניהול:",
          "https://rova-coffee.vercel.app/admin",
          "זוהי בקשת הזמנה בלבד. לא נגבה תשלום באתר.",
        ].join("\n\n"),
      },
      {
        idempotencyKey: `order-notification/${id.data}`,
        signal: AbortSignal.timeout(8000),
      },
    );
    // Resend can resolve with an error instead of rejecting the promise.
    if (error || !data?.id) {
      console.error("order_email_provider_rejected", {
        reason:
          error && providerErrorNames.has(error.name)
            ? error.name
            : "provider_error",
      });
      return "failed" as const;
    }
    console.info("order_email_accepted");
    return "accepted" as const;
  } catch {
    console.error("order_email_request_failed");
    return "failed" as const;
  }
}
