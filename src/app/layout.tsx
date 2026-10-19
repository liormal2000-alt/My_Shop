import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "רובע קפה | רגע קטן, קפה טוב",
  description:
    "קפה משובח וכל מה שצריך לטקס הקפה שלכם. שליחת בקשת הזמנה ללא תשלום באתר.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a className="skip" href="#main">
          דילוג לתוכן
        </a>
        <header className="header">
          <Link href="/" className="brand">
            <span className="brand-icon" aria-hidden="true">
              ◒
            </span>
            <span>
              רובע קפה<small>ROVA COFFEE</small>
            </span>
          </Link>
          <nav aria-label="ניווט ראשי">
            <Link href="/#collection">הקולקציה שלנו</Link>
            <Link href="/admin" className="admin-link">
              כניסת מנהל
            </Link>
          </nav>
        </header>
        {children}
        <footer>
          <Link href="/" className="footer-brand">
            רובע קפה ◒
          </Link>
          <p>קפה טוב. רגע לעצמכם.</p>
          <small>
            האתר מקבל בקשות הזמנה בלבד. לא מתבצע חיוב או תשלום באתר.
          </small>
        </footer>
      </body>
    </html>
  );
}
