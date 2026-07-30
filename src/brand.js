// Gnosem brand assets — inline SVG served by the worker.
// Palette matches CueTV: ink #0F172A, gold #B08D3E, cream #F5F1EA.
// Design principle: type-forward, minimal, one distinctive mark. No stock icons, no gradients, no clip-art.
//
// The "mark" is a circle bisected by a horizontal line: the sphere of knowledge (gnosis) crossed by the
// line of shared memory that runs through every model. It reads clean at 16px and holds up at 512px.

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Gnosem mark"><circle cx="32" cy="32" r="26" fill="none" stroke="#0F172A" stroke-width="4"/><line x1="6" y1="32" x2="58" y2="32" stroke="#B08D3E" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="#0F172A"/></svg>`;

export const MARK_INVERSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Gnosem mark"><circle cx="32" cy="32" r="26" fill="none" stroke="#F5F1EA" stroke-width="4"/><line x1="6" y1="32" x2="58" y2="32" stroke="#B08D3E" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="#F5F1EA"/></svg>`;

// Wordmark — "gnosem" set in Georgia, lowercase, with the "o" replaced by the bisected-circle mark inline.
// The letters gn_sem sit at cap height; the mark drops into the o-slot. Reads immediately at 200px+.
export const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 96" role="img" aria-label="gnosem"><style>.t{font-family:Georgia,'Times New Roman',serif;font-size:80px;fill:#0F172A;letter-spacing:-.02em}</style><text x="0" y="76" class="t">gn</text><g transform="translate(90,20)"><circle cx="28" cy="28" r="24" fill="none" stroke="#0F172A" stroke-width="3.5"/><line x1="4" y1="28" x2="52" y2="28" stroke="#B08D3E" stroke-width="3.5" stroke-linecap="round"/><circle cx="28" cy="28" r="3.5" fill="#0F172A"/></g><text x="150" y="76" class="t">sem</text></svg>`;

// Full lockup — mark left + wordmark right, for header use.
export const LOCKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 96" role="img" aria-label="Gnosem"><g transform="translate(0,16)"><circle cx="32" cy="32" r="26" fill="none" stroke="#0F172A" stroke-width="4"/><line x1="6" y1="32" x2="58" y2="32" stroke="#B08D3E" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="#0F172A"/></g><text x="80" y="76" font-family="Georgia,'Times New Roman',serif" font-size="80" fill="#0F172A" letter-spacing="-.02em">gnosem</text></svg>`;

// Favicon — the mark, dense enough to survive downscaling to 16px.
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#F5F1EA"/><circle cx="16" cy="16" r="12" fill="none" stroke="#0F172A" stroke-width="2.5"/><line x1="3" y1="16" x2="29" y2="16" stroke="#B08D3E" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="16" r="2.5" fill="#0F172A"/></svg>`;

// OG image — 1200x630. Cream background, centered lockup + tagline, small footer attribution.
// SVG OG images render in Slack/Twitter/LinkedIn/Discord previews.
export const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#F5F1EA"/><g transform="translate(390,220)"><circle cx="50" cy="50" r="42" fill="none" stroke="#0F172A" stroke-width="6"/><line x1="8" y1="50" x2="92" y2="50" stroke="#B08D3E" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="50" r="6" fill="#0F172A"/></g><text x="510" y="298" font-family="Georgia,'Times New Roman',serif" font-size="130" fill="#0F172A" letter-spacing="-.02em">gnosem</text><text x="600" y="380" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="34" fill="#0F172A" font-style="italic">one memory. every model.</text><text x="600" y="450" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif" font-size="20" fill="#0F172A" opacity=".7">Cross-vendor AI memory over MCP</text><text x="600" y="580" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif" font-size="16" fill="#0F172A" opacity=".55" letter-spacing=".15em">GNOSEM.DEV  ·  A CUETV LLC PRODUCT</text></svg>`;
