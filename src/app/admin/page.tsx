"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { money, statusLabels } from "@/lib/validation";
type Order = {
  id: string;
  first_name: string;
  last_name: string;
  street_address: string;
  email: string;
  phone: string;
  quantity: number;
  unit_price_agorot: number;
  total_agorot: number;
  created_at: string;
  status: keyof typeof statusLabels;
  products: { name: string } | null;
};
type StatusFilter = "" | keyof typeof statusLabels;
export default function Admin() {
  const client = useRef<SupabaseClient | null>(null);
  const token = useRef("");
  const lock = useRef(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const selectedFilter = useRef<StatusFilter>("");
  const requestVersion = useRef(0);
  const [loadingOrders, setLoadingOrders] = useState(false);
  function getClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw Error("שירות הכניסה עדיין לא הוגדר. פנו למנהל האתר.");
    client.current ??= createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return client.current;
  }
  async function headers() {
    const { data, error } = await getClient().auth.getSession();
    if (error || !data.session) throw Error("ההתחברות פגה. יש להתחבר מחדש.");
    token.current = data.session.access_token;
    return {
      Authorization: `Bearer ${token.current}`,
      "Content-Type": "application/json",
    };
  }
  async function refresh(offset = 0, filter = selectedFilter.current) {
    const version = ++requestVersion.current;
    setLoadingOrders(true);
    setError("");
    setMessage("");
    if (offset === 0) {
      setOrders([]);
      setHasMore(false);
    }
    const params = new URLSearchParams({ offset: String(offset) });
    if (filter) params.set("status", filter);
    try {
      const response = await fetch(`/api/admin/orders?${params}`, {
        headers: await headers(),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      // Guard results and feedback from both earlier filters and pagination requests.
      if (version !== requestVersion.current) return false;
      setOrders((list) =>
        offset
          ? [
              ...list,
              ...body.orders.filter(
                (next: Order) => !list.some((o) => o.id === next.id),
              ),
            ]
          : body.orders,
      );
      setHasMore(body.orders.length === 200);
      return true;
    } catch (e) {
      if (version === requestVersion.current)
        setError(e instanceof Error ? e.message : "טעינת ההזמנות נכשלה");
      return false;
    } finally {
      if (version === requestVersion.current) setLoadingOrders(false);
    }
  }
  function changeFilter(filter: StatusFilter) {
    selectedFilter.current = filter;
    setStatusFilter(filter);
    void refresh(0, filter);
  }
  async function login(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const db = getClient();
      const { error } = await db.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (error) throw Error("הכניסה נכשלה. בדקו את כתובת האימייל והסיסמה.");
      selectedFilter.current = "";
      setStatusFilter("");
      if (!(await refresh(0, ""))) {
        await db.auth.signOut();
        return;
      }
      setSignedIn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "הכניסה נכשלה");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      const { error } = await getClient().auth.signOut();
      if (error) throw error;
      ++requestVersion.current;
      selectedFilter.current = "";
      setStatusFilter("");
      setHasMore(false);
      setSignedIn(false);
      setOrders([]);
      token.current = "";
      setMessage("");
      setError("");
    } catch {
      setError("ההתנתקות נכשלה. נסו שוב או סגרו את החלון.");
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, status: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ id, status }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      if (selectedFilter.current) {
        // A changed status may remove a row from the filtered dataset. Reload
        // page one so subsequent offsets do not skip a matching order.
        await refresh();
      } else {
        setOrders((list) =>
          list.map((o) => (o.id === id ? { ...o, status: body.status } : o)),
        );
      }
      setMessage("הסטטוס עודכן ונשמר בהצלחה.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "העדכון נכשל");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  return (
    <main id="main" className="admin-main">
      {!signedIn ? (
        <section className="login-card">
          <span className="eyebrow">רובע קפה · מאחורי הקלעים</span>
          <h1>כניסת מנהל</h1>
          <p>הכניסה מיועדת לחשבון המנהל המורשה בלבד.</p>
          <form onSubmit={login}>
            <fieldset disabled={busy}>
              <label>
                אימייל
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  dir="ltr"
                />
              </label>
              <label>
                סיסמה
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                />
              </label>
              <button className="button full" type="submit">
                {busy ? "מתחברים…" : "כניסה לניהול ההזמנות"}
              </button>
            </fieldset>
          </form>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">מאחורי כל כוס יש סיפור</span>
              <h1>ניהול הזמנות</h1>
            </div>
            <div className="admin-actions">
              <button
                disabled={busy || loadingOrders || !!pending}
                onClick={async () => {
                  if (await refresh()) setMessage("ההזמנות עודכנו.");
                }}
              >
                רענון
              </button>
              <button
                disabled={busy || loadingOrders || !!pending}
                onClick={signOut}
              >
                התנתקות
              </button>
            </div>
          </div>
          <label className="order-status-filter" htmlFor="order-status-filter">
            סינון לפי סטטוס
            <select
              id="order-status-filter"
              value={statusFilter}
              disabled={busy || !!pending}
              onChange={(e) => changeFilter(e.target.value as StatusFilter)}
            >
              <option value="">הכול</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p>
            ההזמנות החדשות ביותר מופיעות תחילה · {orders.length} הזמנות מוצגות
          </p>
          {hasMore && (
            <button
              disabled={busy || loadingOrders || !!pending}
              onClick={() => void refresh(orders.length)}
            >
              טעינת הזמנות נוספות
            </button>
          )}
          {message && (
            <p role="status" className="notice success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {loadingOrders && <p role="status">טוענים הזמנות…</p>}
          <div className="table-wrap" aria-busy={loadingOrders}>
            <table>
              <caption>בקשות ההזמנה שהתקבלו</caption>
              <thead>
                <tr>
                  <th>מועד</th>
                  <th>לקוח</th>
                  <th>פרטי קשר וכתובת</th>
                  <th>מוצר</th>
                  <th>כמות</th>
                  <th>מחיר יחידה</th>
                  <th>סך הכול</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <time dateTime={o.created_at}>
                        {new Date(o.created_at).toLocaleString("he-IL", {
                          timeZone: "Asia/Jerusalem",
                        })}
                      </time>
                      <small className="order-id" title={o.id}>
                        #{o.id.slice(0, 8)}
                      </small>
                    </td>
                    <td>
                      {o.first_name} {o.last_name}
                    </td>
                    <td>
                      <span dir="ltr">{o.email}</span>
                      <br />
                      <span dir="ltr">{o.phone}</span>
                      <br />
                      {o.street_address}
                    </td>
                    <td>{o.products?.name || "מוצר"}</td>
                    <td>{o.quantity}</td>
                    <td>{money(o.unit_price_agorot)}</td>
                    <td>
                      <strong>{money(o.total_agorot)}</strong>
                    </td>
                    <td>
                      <select
                        aria-label={`סטטוס הזמנה ${o.id.slice(0, 8)}`}
                        value={o.status}
                        disabled={!!pending || busy || loadingOrders}
                        onChange={(e) => update(o.id, e.target.value)}
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {pending === o.id && <small role="status">שומרים…</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!orders.length && !loadingOrders && !error && (
              <p className="empty" role="status">
                {statusFilter
                  ? "אין הזמנות בסטטוס שנבחר."
                  : "עדיין אין הזמנות. הקפה הראשון כבר מחכה."}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
