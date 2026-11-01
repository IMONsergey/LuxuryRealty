# Luxury Realty

Recovered implementation of the original prepared Luxury Realty Figma design. The site uses Astro 7.4.4, TypeScript, GSAP and local source artwork/fonts. It preserves the original home, catalogue, property details, development pages, insights, articles, contacts, privacy and 404 routes.

## Development

Node 24.x is required. Install from the committed lockfile:

```sh
npm ci
npm run dev
```

The local server uses port 4312.

## Verification

```sh
npm run build
npm run check
npm test
npm run test:browser
```

The browser command starts and stops its own local Astro process on port 4312 and uses the shared server Playwright installation. `PLAYWRIGHT_PACKAGE` can override the path to its package.json. The default is `/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json`.

Browser QA covers original image loading at 1440/768/390/320, menu and dialog focus, catalogue filters/sorting/empty states, property return with preserved query, gallery controls, enquiry retry/idempotency/field errors, every page template, cross-project links and normal/reduced motion. Enquiry responses are intercepted in this UI test; no real enquiry is sent. Its report and screenshots are written to the ignored `artifacts/` directory.

## Enquiries

`/api/enquiry` validates data and saves it in private Vercel Blob. A successful UI state requires `{ ok: true, id }` with an ID matching the submitted UUID. Unchanged retries, including closing and reopening the modal, reuse the same reference. Editing previously submitted details starts a fresh reference. Pending requests freeze their fields and context. Network and storage errors preserve the entered information.

The handler and deployment configuration must be verified on the published site separately from mocked browser UI tests. The production project needs a private `BLOB_READ_WRITE_TOKEN`; configuration names are documented in `.env.example`.

## URLs and navigation

The canonical origin reads `SITE_URL`, then `PUBLIC_SITE_URL`, with the assigned project origin `https://luxury-realty-imon.vercel.app` as a default. Project pages link to the four assigned companion deployments. Six Senses is identified as Dubai Marina.

Catalogue filters live in the URL. Opening a property also records the current collection URL, scroll position and selected card in session storage. The explicit return link restores that context. Storage denial does not prevent ordinary navigation or URL filtering.

## Source and limits

Original code recovered from `/workspace/scratch/6ba048c62957/sites/LuxuryRealty`; Figma source file `m3N3lJCoutaziEm4nt4CwO`. The continuation preserves the original composition and routes; it does not substitute whole-section screenshots.

Property descriptions, prices, specifications, photographs and contacts remain the supplied collection content, with the existing confirmation-on-enquiry copy. This is not a live inventory feed. External project publication, actual lead delivery and legal/contact details require their own operational verification. The existing preview `noindex,follow` policy is retained.
