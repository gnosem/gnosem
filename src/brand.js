// Gnosem brand assets — direction 2B "Seal".
// Palette: ink #15140F, paper #FAF9F7, terracotta #A2603F.
// Type: Newsreader (wordmark, uppercase, letter-spacing ≈0.22em). Falls back to Georgia if not loaded.
// Master files live in brand/ and are the visual reference; these constants are what the Worker actually serves.
// Rules in brand/README.md — do not restyle without updating both.

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#A2603F" role="img" aria-label="Gnosem mark"><circle cx="50" cy="50" r="34" stroke-width="10"/><line x1="50" y1="50" x2="71" y2="29" stroke-width="10"/></svg>`;

export const MARK_INK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#15140F" role="img" aria-label="Gnosem mark"><circle cx="50" cy="50" r="34" stroke-width="10"/><line x1="50" y1="50" x2="71" y2="29" stroke-width="10"/></svg>`;

export const MARK_INVERSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#FAF9F7" role="img" aria-label="Gnosem mark"><circle cx="50" cy="50" r="34" stroke-width="10"/><line x1="50" y1="50" x2="71" y2="29" stroke-width="10"/></svg>`;

export const LOCKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" fill="none" role="img" aria-label="Gnosem"><g stroke="#15140F"><circle cx="50" cy="50" r="34" stroke-width="10"/><line x1="50" y1="50" x2="71" y2="29" stroke-width="10"/></g><text x="112" y="66" fill="#15140F" font-family="Newsreader, Georgia, serif" font-size="44" letter-spacing="9.7">GNOSEM</text></svg>`;

export const LOCKUP_INVERSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" fill="none" role="img" aria-label="Gnosem"><g stroke="#FAF9F7"><circle cx="50" cy="50" r="34" stroke-width="10"/><line x1="50" y1="50" x2="71" y2="29" stroke-width="10"/></g><text x="112" y="66" fill="#FAF9F7" font-family="Newsreader, Georgia, serif" font-size="44" letter-spacing="9.7">GNOSEM</text></svg>`;

// Favicon — terracotta tile, mark drawn in paper, scaled 78% for clear space per brand rules.
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#A2603F"/><g fill="none" stroke="#FAF9F7" transform="translate(50 50) scale(0.78) translate(-50 -50)"><circle cx="50" cy="50" r="33" stroke-width="12"/><line x1="50" y1="50" x2="67" y2="33" stroke-width="12"/></g></svg>`;

export const FAVICON_INK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#15140F"/><g fill="none" stroke="#FAF9F7" transform="translate(50 50) scale(0.78) translate(-50 -50)"><circle cx="50" cy="50" r="33" stroke-width="12"/><line x1="50" y1="50" x2="67" y2="33" stroke-width="12"/></g></svg>`;

// OG social preview image (1200×630). Paper background, mark + wordmark + italic tagline, tracked footer.
// Newsreader referenced by name; social crawlers see the Georgia fallback which is acceptable.
export const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#FAF9F7"/><g fill="none" stroke="#A2603F" transform="translate(438,180)"><circle cx="60" cy="60" r="52" stroke-width="14"/><line x1="60" y1="60" x2="92" y2="28" stroke-width="14"/></g><text x="580" y="270" fill="#15140F" font-family="Newsreader, Georgia, serif" font-size="120" letter-spacing="26.4" font-weight="500">GNOSEM</text><text x="600" y="360" text-anchor="middle" fill="#15140F" font-family="Newsreader, Georgia, serif" font-size="34" font-style="italic" opacity=".82">One memory. Every model.</text><text x="600" y="430" text-anchor="middle" fill="#15140F" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif" font-size="20" opacity=".62">Cross-vendor AI memory over MCP</text><text x="600" y="580" text-anchor="middle" fill="#15140F" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif" font-size="14" opacity=".5" letter-spacing="3.36">GNOSEM.DEV  ·  A CUETV LLC PRODUCT</text></svg>`;

// Web font link — inline into any HTML that renders the lockup so the wordmark uses Newsreader.
// If the browser can't fetch Google Fonts, the SVG font-family fallback chain (Georgia, serif) kicks in.
export const NEWSREADER_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">`;
