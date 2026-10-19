import Storefront from "@/components/storefront";
export default function Page() {
  return (
    <main id="main">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">משהו טוב מתבשל כאן</span>
          <h1>
            הרגע שלכם.
            <br />
            <em>הקפה שלנו.</em>
          </h1>
          <p>
            מהפולים הראשונים ועד הספל האהוב.
            <br />
            כל מה שצריך כדי להפוך עוד כוס קפה לטקס קטן.
          </p>
          <a className="button" href="#collection">
            לגלות את הקולקציה <span aria-hidden="true">↙</span>
          </a>
          <div className="hero-note">
            <span aria-hidden="true">✦</span> נבחר בקפידה. נועד להנאה.
          </div>
        </div>
        <div className="hero-visual">
          <div
            className="hero-photo"
            role="img"
            aria-label="פולי קפה קלויים בשק"
          />
          <div className="round-stamp">
            קפה טוב
            <br />
            <b>מתחיל כאן</b>
            <span>ROVA · COFFEE</span>
          </div>
          <div className="photo-caption">רגע של שקט, טעם שנשאר.</div>
        </div>
      </section>
      <div className="values">
        <span>
          01 <b>קפה עם אופי</b>
        </span>
        <span>
          02 <b>כלים לטקס שלכם</b>
        </span>
        <span>
          03 <b>פשוט להזמין, כיף לקבל</b>
        </span>
      </div>
      <Storefront />
    </main>
  );
}
