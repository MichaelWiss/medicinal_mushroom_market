import Link from 'next/link';
import type { Route } from 'next';

// Footer — ported verbatim from /demo/myellium.html lines 727–807.
// Three bands:
//   1. Mauve CTA  (.footer-cta)
//   2. Latest dispatches  (.footer-news)
//   3. Dark footer  (.footer-dark)
// All CSS classes live in globals.css under @layer components.

const NAV_LINKS: { label: string; href: Route }[] = [
  { label: 'Species catalogue', href: '/' as Route },
  { label: 'Subscriptions', href: '/subscriptions' as Route },
  { label: 'Order history', href: '/orders' as Route },
  { label: 'Batch traceability', href: '/traceability' as Route },
  { label: 'Bulk quotes', href: '/quotes' as Route },
];

const DISPATCH_ITEMS = [
  {
    date: '22 Apr 2026',
    category: 'Harvest report',
    title: "Spring Lion's Mane yield exceeds forecast — BCH-2026-044 now available for immediate dispatch",
    linkLabel: 'Read the report',
  },
  {
    date: '18 Apr 2026',
    category: 'Compliance',
    title:
      'Updated CoA format now includes substrate lot traceability and third-party lab verification',
    linkLabel: 'Read more',
  },
];

export function Footer() {
  return (
    <footer>
      {/* ── 1. MAUVE CTA BAND ── */}
      <div className="footer-cta">
        <div className="footer-cta-label">Work with us</div>
        <div className="footer-cta-h">
          Supplying the world&apos;s most<br />demanding cultivators.
        </div>
        <Link href="/sign-in" className="footer-cta-btn">
          Get in touch
        </Link>

        {/* Hexagon cluster art */}
        <svg
          className="footer-cta-hex"
          viewBox="0 0 380 380"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="190" cy="58" r="14" stroke="rgba(60,20,20,0.28)" strokeWidth="1" />
          <path d="M130 90 L160 73 L190 90 L190 124 L160 141 L130 124 Z" stroke="rgba(60,20,20,0.28)" strokeWidth="1" fill="none" />
          <path d="M190 90 L220 73 L250 90 L250 124 L220 141 L190 124 Z" stroke="rgba(60,20,20,0.22)" strokeWidth="1" fill="none" />
          <path d="M100 156 L130 139 L160 156 L160 190 L130 207 L100 190 Z" stroke="rgba(60,20,20,0.18)" strokeWidth="1" fill="none" />
          <path d="M160 156 L190 139 L220 156 L220 190 L190 207 L160 190 Z" stroke="rgba(60,20,20,0.26)" strokeWidth="1" fill="none" />
          <path d="M220 156 L250 139 L280 156 L280 190 L250 207 L220 190 Z" stroke="rgba(60,20,20,0.18)" strokeWidth="1" fill="none" />
          <path d="M130 222 L160 205 L190 222 L190 256 L160 273 L130 256 Z" stroke="rgba(60,20,20,0.14)" strokeWidth="1" fill="none" />
          <path d="M190 222 L220 205 L250 222 L250 256 L220 273 L190 256 Z" stroke="rgba(60,20,20,0.14)" strokeWidth="1" fill="none" />
          <circle cx="160" cy="141" r="3" fill="rgba(60,20,20,0.2)" />
          <circle cx="220" cy="141" r="3" fill="rgba(60,20,20,0.2)" />
          <circle cx="190" cy="207" r="3" fill="rgba(60,20,20,0.16)" />
          <circle cx="130" cy="207" r="3" fill="rgba(60,20,20,0.12)" />
          <circle cx="250" cy="207" r="3" fill="rgba(60,20,20,0.12)" />
        </svg>
      </div>

      {/* ── 2. LATEST DISPATCHES ── */}
      <div className="footer-news">
        <div className="fn-heading">Latest dispatches</div>
        <div className="fn-grid">
          {DISPATCH_ITEMS.map((item) => (
            <div key={item.date} className="fn-item">
              <div className="fn-meta">
                {item.date} <span>&#9632;</span> {item.category}
              </div>
              <div className="fn-title">{item.title}</div>
              <span className="fn-link">
                {item.linkLabel} &nbsp;&rarr;
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. DARK FOOTER ── */}
      <div className="footer-dark">
        <div className="fd-grid">
          {/* Column 1: wordmark + address */}
          <div>
            <div className="fd-wordmark">
              Mycelium <i>Supply Co.</i>
            </div>
            <div className="fd-address">
              Unit 4, Fermentation Quarter<br />
              Bristol, BS1 4RQ<br />
              United Kingdom<br />
              <br />
              supply@myceliumco.com
            </div>
          </div>

          {/* Column 2: nav links */}
          <div>
            <div className="fd-nav-label">Navigate</div>
            {NAV_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="fd-nav-link">
                {item.label}
              </Link>
            ))}
          </div>

          {/* Column 3: contact */}
          <div>
            <div className="fd-nav-label">Contact</div>
            <Link href="/sign-in" className="fd-contact-link">
              Account manager <span>&#8599;</span>
            </Link>
            <span className="fd-contact-link">
              Lab support <span>&#8599;</span>
            </span>
            <span className="fd-contact-link">
              LinkedIn <span>&#8599;</span>
            </span>
            <span className="fd-contact-link">
              Compliance docs <span>&#8599;</span>
            </span>
          </div>
        </div>

        <hr className="fd-rule" />

        <div className="fd-bottom">
          <span>&copy; 2026 Mycelium Supply Co. Ltd. &nbsp; Registered in England &amp; Wales.</span>
          <div className="fd-cert">
            <div className="fd-cert-dot" />
            <span>ISO 22000 certified &nbsp;&middot;&nbsp; Cold-chain accredited &nbsp;&middot;&nbsp; SALSA approved</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
