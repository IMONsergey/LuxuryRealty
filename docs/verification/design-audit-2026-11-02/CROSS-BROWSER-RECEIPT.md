# Luxury Realty — final copy and cross-browser focused QA receipt

Parent UI candidate: `98c26090941e2f1628c37de5832d69700e62c6fe`.

## Final copy correction

- Result count now uses singular/plural correctly: `1 illustrative example` / `N illustrative examples`; the rent example count follows the same rule.
- Search label changed from “Location or keyword” to “Name or keyword”; placeholder is “Search property names”. Search remains limited to visible card title/subtitle text. No hidden location, type, bedroom, price or feature data was restored.

Build job `69b4e8a8-26f2-403e-b02b-e66dbf46e5c7` succeeded. Chromium targeted copy check `0efe9136-8c58-41e2-95a8-a29e292fc0bd` passed at 390px: singular count, exact label and placeholder, preserved URL query, no overflow, no page errors.

## WebKit / Linux — PASS

Engine: Playwright 1.58.2 WebKit 26.0, local static production build, no Chromium-specific flags.

Job `2170493b-6a97-45d4-97ff-c0bef5933ecd` succeeded.

At both 390×844 and 1440×900:
- Reduced-motion preference active and verified.
- No horizontal overflow (`scrollWidth === clientWidth`).
- Menu opened; Tab remained inside the menu dialog; Escape closed it, reset `aria-expanded`, and restored focus to the menu toggle.
- Gallery opened; fixture failed the second photograph twice during initial/preload and explicit attempt; visible failure message appeared. Once the mock failure was released, the image loaded successfully on retry.
- ArrowLeft keyboard navigation and Escape/focus restoration passed.
- Catalogue URL containing legacy hidden `type/beds/min/max/features/sort` parameters canonicalized to the supported visible keyword query.
- Visible-title search returned exactly `1 illustrative example`; the label/placeholder matched the actual title-only search.
- Searching hidden placeholder location returned zero; honest empty state displayed.
- Reset restored all eight examples and cleared the query URL.
- Rent returned `0 rental examples` with the empty state visible.
- API request count: 0; page errors: 0.

## Visual evidence

Settled WebKit screenshots saved in `artifacts/cross-browser-2026-11-02/` and visually opened:
- `luxury-webkit-390-menu-open.png`
- `luxury-webkit-1440-menu-open.png`
- `luxury-webkit-390-gallery-open.png`
- `luxury-webkit-1440-gallery-open.png`
- `luxury-webkit-390-single-result.png`
- `luxury-webkit-1440-single-result.png`
- `luxury-webkit-390-catalogue-rent.png`
- `luxury-webkit-1440-catalogue-rent.png`

Settled screenshot capture job `4c9aeb44-96aa-4a96-bae2-6aaa92046c49` succeeded. Main WebKit test job `2170493b-6a97-45d4-97ff-c0bef5933ecd` is the authoritative receipt.

## Firefox / Linux — BLOCKED BY SHARED RUNTIME, NOT A PASS

The same paired-workstation Playwright 1.58.2 Firefox runtime failure is documented in the ORLA receipt: launch/context succeeds but `BrowserContext.newPage()` throws `TypeError: Cannot read properties of undefined (reading '_page')` before navigation. No Firefox UI test ran for Luxury and no Firefox pass is claimed.

## Scope and unresolved content/security

- Only local static assets and mock request behavior were used. No real enquiry form was submitted.
- No backend, production, credentials or dependency branch changed.
- Luxury inventory, real listing identity, actual prices, photography-to-listing mapping and legal/operator details remain unverified. The eight catalogue entries remain explicitly illustrative, not offers.
- Dependency install previously reported 11 advisories (3 moderate, 8 high); this focused UI task did not remediate or re-audit them.
- ORLA and Six Senses content decisions, including Six Senses operator/phone-country/editorial questions, remain separate and unresolved. Atlantis dependency `b0724ce` remains HOLD.
