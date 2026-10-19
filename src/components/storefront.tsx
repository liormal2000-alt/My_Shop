"use client";
import { useEffect, useRef, useState } from "react";
import { money, orderSchema, type Product } from "@/lib/validation";
import ProductImage from "./product-image";

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const r = await fetch("/api/products");
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setProducts(body.products);
    } catch {
      setLoadError("לא הצלחנו לטעון את הקולקציה. נסו שוב.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function select(product: Product) {
    setSelected(product);
    setQuantity(1);
    setMessage("");
    setSuccess(false);
    setFields({});
    dialog.current?.showModal();
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !selected) return;
    const form = new FormData(event.currentTarget);
    const parsed = orderSchema.safeParse({
      ...Object.fromEntries(form),
      product_id: selected.id,
      quantity,
    });
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path[0], i.message]),
        ),
      );
      setMessage("יש לתקן את השדות המסומנים.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    setFields({});
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (!response.ok || !body.order_id)
        throw Error(body.error || "שמירת ההזמנה נכשלה");
      setSuccess(true);
      setMessage(
        "בקשת ההזמנה נשמרה בהצלחה! ניצור איתכם קשר להמשך הטיפול. לא בוצע חיוב.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "אירעה שגיאה. נסו שוב.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section id="collection" className="collection">
      <div className="section-heading">
        <div>
          <span className="eyebrow">הדברים שעושים לנו את הבוקר</span>
          <h2>הקולקציה שלנו</h2>
        </div>
        <span className="collection-count">
          קפה, כלים ורגעים טובים · 10 פריטים
        </span>
      </div>
      <p className="order-note">
        בוחרים מוצר וכמות ושולחים בקשת הזמנה. אין תשלום באתר.
      </p>
      {loading && (
        <div className="loading" role="status">
          טוענים את הקולקציה…
          <div className="skeleton-grid">
            {[1, 2, 3, 4].map((n) => (
              <div className="skeleton" key={n} />
            ))}
          </div>
        </div>
      )}
      {loadError && (
        <div className="notice error" role="alert">
          {loadError} <button onClick={load}>לנסות שוב</button>
        </div>
      )}
      {!loading && !loadError && !products.length && (
        <p role="status">הקולקציה מתעדכנת. חזרו אלינו בקרוב.</p>
      )}
      <div className="product-grid">
        {products.map((product, i) => (
          <article key={product.id} className="product-card">
            <button
              className="product-picture"
              onClick={() => select(product)}
              aria-label={`הזמנת ${product.name}`}
            >
              <ProductImage src={product.image_path} alt={product.name} />
              <span className="product-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="picture-cta" aria-hidden="true">
                ↙
              </span>
            </button>
            <div className="product-info">
              <div className="product-title">
                <h3>{product.name}</h3>
                <span>{money(product.price_agorot)}</span>
              </div>
              <p>{product.description}</p>
              <button className="text-button" onClick={() => select(product)}>
                לבקשת הזמנה <span aria-hidden="true">←</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="order-dialog"
      >
        <button
          type="button"
          className="close"
          aria-label="סגירה"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        {selected && (
          <>
            {success ? (
              <div className="success-panel">
                <span aria-hidden="true">✓</span>
                <h2>איזה כיף, קפה בדרך.</h2>
                <p role="status">{message}</p>
                <button
                  className="button"
                  onClick={() => dialog.current?.close()}
                >
                  בחזרה לקולקציה
                </button>
              </div>
            ) : (
              <>
                <span className="eyebrow">עוד רגע של קפה</span>
                <h2>בקשת הזמנה</h2>
                <div className="order-summary">
                  <strong>{selected.name}</strong>
                  <span>{money(selected.price_agorot)} ליחידה</span>
                </div>
                <form onSubmit={submit} noValidate>
                  <fieldset disabled={busy}>
                    <label>
                      כמות{" "}
                      <input
                        name="quantity"
                        aria-label="כמות"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        required
                        value={Number.isNaN(quantity) ? "" : quantity}
                        onChange={(e) => setQuantity(e.target.valueAsNumber)}
                        aria-invalid={!!fields.quantity}
                      />
                      {fields.quantity && (
                        <small className="field-error">{fields.quantity}</small>
                      )}
                    </label>
                    <div className="form-grid">
                      {[
                        {
                          name: "first_name",
                          label: "שם פרטי",
                          auto: "given-name",
                        },
                        {
                          name: "last_name",
                          label: "שם משפחה",
                          auto: "family-name",
                        },
                        {
                          name: "street_address",
                          label: "כתובת רחוב",
                          auto: "street-address",
                        },
                        {
                          name: "email",
                          label: "אימייל Gmail",
                          auto: "email",
                          type: "email",
                        },
                        {
                          name: "phone",
                          label: "טלפון — 10 ספרות",
                          auto: "tel",
                          type: "tel",
                        },
                      ].map((f) => (
                        <label key={f.name}>
                          {f.label}
                          <input
                            name={f.name}
                            aria-label={f.label}
                            type={f.type || "text"}
                            autoComplete={f.auto}
                            required
                            maxLength={f.name === "email" ? 254 : 200}
                            dir={f.type ? "ltr" : undefined}
                            aria-invalid={!!fields[f.name]}
                            aria-describedby={
                              fields[f.name] ? `error-${f.name}` : undefined
                            }
                          />
                          {fields[f.name] && (
                            <small
                              className="field-error"
                              id={`error-${f.name}`}
                            >
                              {fields[f.name]}
                            </small>
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="total">
                      <span>סך הבקשה</span>
                      <strong>
                        {money(
                          selected.price_agorot *
                            (Number.isInteger(quantity) &&
                            quantity >= 1 &&
                            quantity <= 100
                              ? quantity
                              : 0),
                        )}
                      </strong>
                    </div>
                    <p className="fine-print">
                      זוהי בקשת הזמנה בלבד. לא נגבה תשלום באתר. המחיר הסופי
                      מחושב לפי המחיר העדכני בעת שמירת הבקשה.
                    </p>
                    <button className="button full" type="submit">
                      {busy ? "שומרים את ההזמנה…" : "שליחת בקשת הזמנה"}
                    </button>
                  </fieldset>
                  {message && (
                    <p className="notice error" role="alert">
                      {message}
                    </p>
                  )}
                </form>
              </>
            )}
          </>
        )}
      </dialog>
    </section>
  );
}
