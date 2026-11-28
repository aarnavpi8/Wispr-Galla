/**
 * BolKhata logo. Meaning: a speech bubble (bol, "speak") that is also a khata page (the red
 * double margin rule of an Indian ledger book), with a voice wave that ends in a tick:
 * "say it, and it's written down".
 *
 * `tile`: the mark on an indigo rounded square (app icon, headers).
 * `bare`: just the mark, for placing on an already-dark background.
 */
export function LogoMark({
  size = 40,
  variant = "tile",
  className = "",
}: {
  size?: number;
  variant?: "tile" | "bare";
  className?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden focusable="false">
      {variant === "tile" && (
        <>
          <defs>
            <linearGradient id="bk-tile" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3fa56b" />
              <stop offset="1" stopColor="#155238" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="16" fill="url(#bk-tile)" />
        </>
      )}
      {/* Speech bubble = khata page */}
      <path
        d="M20 12h24a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H27l-8.6 6.6a1.4 1.4 0 0 1-2.3-1.1V47.2A10 10 0 0 1 10 38V22a10 10 0 0 1 10-10Z"
        fill="#d7f08a"
      />
      {/* The ledger's red double margin */}
      <path d="M16.6 20.5v19M18.8 20.5v19" stroke="#d2553f" strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round" />
      {/* Voice wave that ends in a tick: spoken, then saved */}
      <g stroke="#1d2a22" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M23.5 27v6" />
        <path d="M29.5 22.5v15" />
        <path d="M35.5 25.5v9" />
        <path d="M40.5 31l3.2 3.2 6.3-8.4" />
      </g>
    </svg>
  );
}

/** Mark + "BolKhata" wordmark ("Bol" in iris, "Khata" in ink). */
export function Logo({
  size = 40,
  tone = "light",
  className = "",
}: {
  size?: number;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-extrabold tracking-tight ${tone === "dark" ? "text-white" : "text-ink-950"}`} style={{ fontSize: size * 0.5 }}>
        <span className={tone === "dark" ? "text-gold-300" : "text-iris-500"}>Bol</span>Khata
      </span>
    </span>
  );
}
