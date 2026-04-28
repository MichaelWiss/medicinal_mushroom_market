// Decorative molecule SVG that fades in/out behind the collapsed sidebar.
// Ported verbatim from /demo/myellium.html (lines 545-559).
export function MoleculeArt() {
  return (
    <svg
      width="200"
      height="380"
      viewBox="0 0 200 380"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="100" cy="80" r="36" stroke="rgba(178,133,134,0.35)" strokeWidth="1" />
      <line x1="100" y1="116" x2="80" y2="200" stroke="rgba(178,133,134,0.25)" strokeWidth="1" />
      <line x1="100" y1="116" x2="120" y2="200" stroke="rgba(178,133,134,0.25)" strokeWidth="1" />
      <line x1="80" y1="200" x2="120" y2="200" stroke="rgba(178,133,134,0.2)" strokeWidth="1" />
      <line x1="80" y1="200" x2="60" y2="290" stroke="rgba(178,133,134,0.2)" strokeWidth="1" />
      <line x1="120" y1="200" x2="140" y2="290" stroke="rgba(178,133,134,0.2)" strokeWidth="1" />
      <line x1="80" y1="200" x2="100" y2="310" stroke="rgba(178,133,134,0.15)" strokeWidth="1" />
      <line x1="120" y1="200" x2="100" y2="310" stroke="rgba(178,133,134,0.15)" strokeWidth="1" />
      <circle cx="80" cy="200" r="5" fill="none" stroke="rgba(178,133,134,0.3)" strokeWidth="1" />
      <circle cx="120" cy="200" r="5" fill="none" stroke="rgba(178,133,134,0.3)" strokeWidth="1" />
      <circle cx="60" cy="290" r="3" fill="none" stroke="rgba(178,133,134,0.2)" strokeWidth="1" />
      <circle cx="140" cy="290" r="3" fill="none" stroke="rgba(178,133,134,0.2)" strokeWidth="1" />
      <circle cx="100" cy="310" r="3" fill="none" stroke="rgba(178,133,134,0.18)" strokeWidth="1" />
    </svg>
  );
}
