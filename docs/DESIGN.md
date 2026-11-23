# Design system: Candle Obsession

How the site looks and moves, and where each piece lives in the code. Everything here is taken from the
actual source files; if you change a value, update this document too.

- Styles: `wwwroot/css/site.css` (tokens, all page styles, flame/smoke/wax-drip/evening mode, reduced-motion fallbacks)
- JS-driven UI styles: `ClientApp/src/styles/islands.css` (ember, toast, cart drawer/cart view, gift box), bundled into `/dist/app.css`
- Pre-paint script: `wwwroot/js/boot.js`
- Front-end code: `ClientApp/src` (built by Vite into `wwwroot/dist`)

The look: warm cream paper, cocoa-brown text, honey and amber accents taken from the logo, candlelight
glows. Calm and handmade rather than flashy. Every animation has a reduced-motion fallback.

---

## 1. Colour tokens

Defined in the `:root` block at the top of `wwwroot/css/site.css`. The colours come from the logo
(drop `#F2BE84`, bowl `#D48F49` / `#B37428`, wordmark `#8F5520`) and the original site (`#45382F`, `#F4EEE5`).

Contrast ratios below were calculated with the WCAG 2.x formula. AA needs **4.5:1** for normal text, **3:1**
for large text (24px, or 18.66px bold) and for non-text UI such as borders and icons.

### Surfaces

| Token | Value | Use | Contrast notes |
|---|---|---|---|
| `--color-cream` | `#f7f1e8` | Page background, cart drawer, wax-drip fill | Base light surface. `--color-text` on it 12.0:1 |
| `--color-paper` | `#fdfaf5` | Cards, forms, order summary, checkout panels | `--color-text` 13.0:1, `--color-text-muted` 6.5:1 |
| `--color-sand` | `#efe4d6` | Alternate sections (Instagram strip), notices, hover fills, enquiry box | `--color-text-muted` 5.4:1, `--color-amber` 4.8:1 |
| `--color-line` | `#dccdbb` | Hairlines, input borders, empty cart count | Decorative only (1.4:1 on cream). Inputs also rely on label + focus ring, not the border alone |
| `--color-cocoa` | `#45382f` | Original brand brown: headings, header text, primary button, active chip, dark text on light | 10.1:1 on cream, 10.9:1 on paper |
| `--color-espresso` | `#2f251f` | Darkest surface: announcement bar, footer, gift guide, toast | `--color-text-on-dark` 13.1:1, `--color-glow` 8.9:1 |

### Text

| Token | Value | Use | Contrast notes |
|---|---|---|---|
| `--color-text` | `#382c24` | Body text | 12.0:1 on cream, 13.0:1 on paper, 10.8:1 on sand |
| `--color-text-muted` | `#6b5848` | Secondary text, captions, "Price on request" | 6.0:1 on cream, 6.5:1 on paper, 5.4:1 on sand (the CSS comment says 5.9:1) |
| `--color-text-on-dark` | `#f8efe3` | Text on espresso/cocoa | 13.1:1 on espresso, 9.9:1 on cocoa |
| `--color-text-on-dark-muted` | `#d9c6b0` | Secondary text on dark (footer links, gift-guide descriptions) | 9.0:1 on espresso, 6.8:1 on cocoa |

### Brand accents

| Token | Value | Use | Contrast notes |
|---|---|---|---|
| `--color-glow` | `#f2be84` | Logo drop. Eyebrows, icons and links **on dark** surfaces (footer, gift guide, announcement) | 8.9:1 on espresso. Never for text on light (1.5:1 on cream) |
| `--color-honey` | `#d48f49` | Logo bowl (light). Toggle "on" track, input focus glow, warm shadows | Decorative / non-text only (2.4:1 on cream) |
| `--color-caramel` | `#b37428` | Logo bowl (dark). Hover borders, scent-tag icons, placeholder icons | **Decorative only**: 3.4:1 on cream (passes 3:1 for icons/borders, not for body text) |
| `--color-amber` | `#8f5520` | Wordmark. Links and eyebrows on light, primary-button hover, cart count badge, focus ring | 5.4:1 on cream, 5.8:1 on paper, 4.8:1 on sand (the CSS comment says 6.1:1 on cream; the measured value is 5.4:1, still AA). White on amber (cart count) 6.0:1 |
| `--color-ribbon` | `#8f2f3a` | Gift ribbon, "Offer" badge (white text), alcohol notice icon | 7.1:1 on cream; white on ribbon 8.0:1 |
| `--color-success` | `#3f6b3a` | In-stock text, contents-list ticks, success notices | 5.5:1 on cream, 6.0:1 on paper |
| `--color-danger` | `#9b2c2c` | Form errors, invalid fields, cart warnings | 6.7:1 on cream, 7.2:1 on paper |

### Light & flame

| Token | Value | Use | Contrast notes |
|---|---|---|---|
| `--color-flame-core` | `#fff7df` | Inner flame gradient | Decorative (aria-hidden) |
| `--color-flame-mid` | `#ffcf73` | Middle flame gradient | Decorative |
| `--color-flame-edge` | `#ff8a1f` | Outer flame edge | Decorative |
| `--color-ember` | `#ffb45c` | Ember / candlelight colour | Decorative |
| `--glow-warm` | `rgba(255, 179, 92, 0.45)` | Warm glow | Decorative |

A few one-off colours live next to the component that uses them (for example `.badge-gift` `#f6e1cc` /
`#7a4517`, `.draft-notice` `#fff4dc`, hero overlay gradients, the brand-name colour `#7a4517`). The meta
`theme-color` is cocoa `#45382f`.

---

## 2. Typography

| Token | Value |
|---|---|
| `--font-display` | `"Playfair Display", "Iowan Old Style", Georgia, serif` (headings, prices, product names, brand name) |
| `--font-body` | `"Jost", "Avenir Next", "Segoe UI", system-ui, sans-serif` (everything else) |

**Fonts:** Playfair Display (variable, weights 400–900, normal + italic) and Jost (variable, weights 100–900).

- **Self-hosted** from `wwwroot/fonts/*.woff2` (taken from the `@fontsource-variable` packages), declared
  with `@font-face` at the top of `site.css`, `font-display: swap`, and the two main files are preloaded in
  `Pages/Shared/_Layout.cshtml`.
- **Why self-hosted:** no requests to Google Fonts, so visitors' IP addresses are not sent to Google
  (GDPR), there's no third-party dependency, and fonts load faster from the same server.
- **Licence:** SIL Open Font License 1.1; the licence texts are next to the fonts
  (`wwwroot/fonts/OFL-PlayfairDisplay.txt`, `wwwroot/fonts/OFL-Jost.txt`). OFL allows use on websites,
  including commercial ones.
- Subsets: Latin and Latin Extended only (Playfair italic: Latin). **Greek text** would fall back to the next
  font in the stack (Georgia / system sans), so a Greek version of the site would need Greek-capable fonts.

**Type scale** (fluid, grows with the screen):

| Token | Value | Used for |
|---|---|---|
| `--step--1` | `clamp(0.82rem, 0.8rem + 0.1vw, 0.88rem)` | Small print |
| `--step-0` | `clamp(1rem, 0.96rem + 0.2vw, 1.08rem)` | Body text (line-height 1.6) |
| `--step-1` | `clamp(1.2rem, 1.1rem + 0.45vw, 1.4rem)` | h3, hero lede, checkout step titles |
| `--step-2` | `clamp(1.5rem, 1.3rem + 0.9vw, 2rem)` | h2, product price on detail page |
| `--step-3` | `clamp(2rem, 1.6rem + 1.8vw, 3rem)` | h1, section titles, product title |
| `--step-4` | `clamp(2.6rem, 1.8rem + 4vw, 5rem)` | Hero headline |

Headings: weight 500, line-height 1.15, letter-spacing −0.01em, colour cocoa. Eyebrows: Jost 0.78rem,
weight 500, uppercase, letter-spacing 0.24em, amber.

---

## 3. Spacing, layout, shape, shadow and motion tokens

There is no numbered spacing scale; spacing uses `rem` values and fluid `clamp()` per component, built
around these layout tokens:

| Token | Value | Use |
|---|---|---|
| `--container` | `1200px` | Max content width |
| `--gutter` | `clamp(16px, 4vw, 40px)` | Side padding of every section (16px on phones) |
| `--header-h` | `72px` (`108px` below 860px, where the nav wraps under the logo) | Sticky header height; used for scroll padding and sticky panels |
| Section padding | `clamp(3.5rem, 8vw, 6.5rem)` vertical | `.section` |

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `6px` | Focus outline radius, skip link |
| `--radius` | `14px` | Notices, choices, Instagram tiles, product cards on phones |
| `--radius-lg` | `24px` | Product cards, panels, gallery, gift tiles |
| Pills | `999px` | Buttons, chips, badges, scent tags, toast |

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(56,44,36,.06), 0 2px 8px rgba(56,44,36,.05)` | Resting cards and panels |
| `--shadow` | `0 10px 30px -12px rgba(56,44,36,.25)` | Hovered cards, result card, story photo |
| `--shadow-lit` | `0 22px 50px -16px rgba(212,143,73,.6), 0 0 0 1px rgba(242,190,132,.55)` | A **lit** candle card (warm halo) |

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default easing for reveals, hovers, glows |
| `--ease-spring` | `cubic-bezier(0.2, 0.9, 0.3, 1.25)` | Slight overshoot: flame igniting, toggle thumb, cart count pop, toast |
| `--focus-ring` | `0 0 0 3px var(--color-paper), 0 0 0 5px var(--color-amber)` | Keyboard focus on everything (`:focus-visible`). Inputs use an amber border + honey glow instead |

Durations are set per effect (typically 0.2–0.35s for hovers, 0.6–0.9s for glows and reveals).

**Breakpoints:** 1000px (product detail and checkout become one column), 860px (nav scrolls sideways under
the logo, story stacks, Instagram grid 2 columns), 760px (cart page one column, in `islands.css`), 600px
(product grid fixed at 2 columns, compact cards, single-column forms).

**Touch targets:** buttons ≥ 48px (small 40px), icon buttons 44px, nav links 44px, cart link 48px,
variant chips and quantity buttons 44px.

---

## 4. Components

| Component | Classes | Where |
|---|---|---|
| Buttons | `.button` + `-small`, `-large`, `-block`, `-outline`, `-ghost`, `-light`, `-outline-light`; `.text-link`, `.text-button`, `.icon-button` | `site.css` → Buttons |
| Chips (filters) | `.chip`, `.chip.is-active`, `.chip-row` | Shop filters |
| Badges | `.badge`, `.badge-gift`, `.badge-sale` ("Offer"), `.badge-muted` ("Sold out") | Product cards |
| Notices | `.notice`, `-muted`, `-success`, `-alcohol`; `.draft-notice` | Product page, checkout, legal pages (`_DraftNotice.cshtml`) |
| Forms | `.form-group`, `.form-row`, `.choice` (delivery/payment cards), `.check`, `.toggle` (gift wrap), `.char-count`, `.field-error` | Checkout, withdraw, admin |
| Announcement bar | `.announcement` | `_Layout.cshtml` (driven by `Shop:Announcement`) |
| Header | `.main-header` (sticky, frosted), `.brand`, `.main-nav`, `.evening-toggle`, `.cart-link` + `.cart-count` | `_Layout.cshtml` |
| Footer | `.main-footer`, `.footer-grid`, `.footer-legal` | `_Layout.cshtml` |
| Icons | SVG sprite `#i-…` (Lucide, ISC licence), `.icon` | `Pages/Shared/_Icons.cshtml` (generated) |
| Hero | `.hero`, `.hero-ambient`, `.hero-title`, `.hero-eyebrow` | `Pages/Index.cshtml` |
| Product card | `.product-card`, `.product-media`, `.media-placeholder`, `.product-body`, `.price` | `Pages/Shared/_ProductCard.cshtml` |
| Flame | `.wick-flame`, `.flame`, `.wick`, `.smoke` | `Pages/Shared/_Flame.cshtml` |
| Wax drip divider | `.wax-drip` | `Pages/Shared/_WaxDrip.cshtml` |
| Smoke divider | `.smoke-divider` | `Pages/Index.cshtml` |
| Gift guide tile | `.guide-tile`, `.guide-link` | `Pages/Index.cshtml` + `islands/GiftGuide.tsx` |
| Gift box | `.gift-reveal`, `.gift-box` | `islands/GiftReveal.tsx` |
| Product detail | `.pd-gallery`, `.pd-slides`, `.pd-thumbs`, `.scent-tags`, `.scent-pyramid`, `.contents-list`, `.variant` + `.swatch`, `.qty`, `.pd-enquire`, `.pd-details` | `Pages/Products/Detail.cshtml` |
| Cart | `.cart-drawer`, `.drawer-backdrop`, `.cart-line`, `.cart-summary`, `.cart-empty` | `islands/CartDrawer.tsx`, `CartView.tsx`, `CartPage.tsx` |
| Toast | `.toast` (polite live region) | `ui/shop.ts` |
| Checkout | `.checkout-grid`, `.customer-details`, `.order-summary`, `.step` | `Pages/Checkout.cshtml`, `ui/checkoutPage.ts` |
| Order result / 404 | `.order-result-card`, `.result-flame` | `Pages/OrderStatus/*`, `Pages/NotFound.cshtml` |
| Info pages | `.info-page`, `.prose` | `Pages/Info/*` |
| Admin | `.admin`, `.admin-table` | `Pages/Admin/*` |
| Utilities | `.visually-hidden`, `.skip-link`, `.breadcrumbs`, `.empty-state`, `.reveal` | `site.css` |

---

## 5. Effects

### How motion is switched on

`wwwroot/js/boot.js` runs before the first paint. It swaps `html.no-js` for `html.js`, adds
`html.motion-ok` **only if** the visitor has not asked for reduced motion, and restores evening mode from
`localStorage` (`co.evening`) so the page doesn't flash bright first. CSS gates the entrance animations on
`html.motion-ok`, and the `@media (prefers-reduced-motion: reduce)` block at the end of `site.css` shortens
all remaining animations and transitions to ~0 and switches off the decorative ones. JavaScript checks
`prefersReducedMotion()` (`ClientApp/src/lib/util.ts`), and `main.ts` reacts if the setting changes while the
page is open.

React components are loaded as "islands" (`ClientApp/src/islands/index.ts`): code-split, mounted into
server-rendered markup, and every island has a server-rendered fallback, so the page works without them.
Hero text and the cart page load immediately; the gift guide and gift-box reveal load when scrolled near;
the cart drawer loads on the first click on the cart icon (pre-fetched when the browser is idle).
**Purely decorative islands (hero headline, eyebrow shimmer) are skipped entirely for reduced-motion visitors.**

### Effect reference

| Effect | What it does | Where it lives | Reduced-motion fallback |
|---|---|---|---|
| **Burning wick** (product cards) | Hovering or keyboard-focusing a candle card lights a CSS flame on the wick in the photo (position from `images[0].flame` x/y in `products.json`, or a small wick at the top of the card body if none). The flame ignites with a springy grow, sways (`flame-sway`, 2.4s), and flickers organically: one shared `requestAnimationFrame` loop nudges `--flicker-scale` (0.92–1.08), `--flicker-rot` (±3.5°), `--flicker-x` (±1px) and `--flicker-glow` at random 70–140ms intervals, only while a candle is lit. A warm soft-light glow spreads over the photo and the card gets `--shadow-lit`. Leaving blows it out: the flame shrinks and a two-line smoke wisp rises (`smoke-rise`/`smoke-draw`, 1.6s). **Touch** devices (no hover): a card lights when ≥60% of it is on screen and goes out when it scrolls away. Also on the product-page gallery (bigger flame), the order-success page (candle already lit) and the cancelled/404 pages (looping smoke from an unlit wick). Only `type: "candle"` products get it. | `Pages/Shared/_Flame.cshtml` (markup), `ClientApp/src/effects/flame.ts` (lighting + flicker), `site.css` → "Flame" and "Product grid & card" | The candle **still lights** (a steady glow, so the interaction keeps its meaning) but never flickers, sways or smokes: the flicker loop doesn't start, `flame-sway` is off, smoke is hidden, and the photo glow is fixed at 0.85 opacity. |
| **Add-to-cart ember** | A small glowing spark arcs from the "Add to cart" button up to the cart icon (Web Animations API, transforms only, 780ms), then the cart icon glows (`cart-glow`, 1.1s) and the count badge pops. A polite toast says "… added to your cart" with a "View cart" link. | `ClientApp/src/effects/ember.ts`, `ClientApp/src/ui/shop.ts`, `islands.css` → `.ember-particle`, `site.css` → `.cart-link.is-glowing` | No flying ember. `ember.ts` calls the cart glow directly, but the global reduced-motion rule shortens it to an instant, so the feedback is the updated cart count and the toast (which is also announced to screen readers). |
| **Evening mode** (optional) | A moon/sun button in the header dims the page with a fixed veil; a soft 420px candle light follows the mouse, the last touch, or the focused element when using the keyboard. The header turns dark. Off by default, remembered per browser, button hidden until JS runs. | `ClientApp/src/effects/evening.ts`, `wwwroot/js/boot.js` (restores before paint), `site.css` → "Evening mode" (`.evening-veil`, `html[data-evening]`), button in `_Layout.cshtml` | Still available (it's a lighting preference, not motion). The veil appears without the 0.8s fade and the light simply jumps to the pointer/focus position. |
| **Wax-drip divider** | A wavy SVG edge of melted wax hanging from one section over the next. Coloured with the section above (`currentColor`). Static. | `Pages/Shared/_WaxDrip.cshtml` (model: `light`, `footer`…), `site.css` → `.wax-drip`. Used on the home page (after the collection), product page and above the footer | Not animated, nothing to change. |
| **Smoke divider** | Two thin smoke lines that drift gently (`smoke-drift`, 6s alternate) between the gift sets and "Our story" sections. | `Pages/Index.cshtml` (`.smoke-divider`), `site.css` → "Wax drip & smoke dividers" | Hidden (`display: none`). |
| **Hero ambient light** | Three blurred warm light pools behind the hero photo flicker slowly at different speeds (`ambient-flicker`, 2.9–4.6s), like candlelight on a wall. | `Pages/Index.cshtml` (`.hero-ambient` + `.ember-light`), `site.css` → "Hero" | Static warm glow (`animation: none`). |
| **Hero headline** ("Light up your moments.") | Words drift down out of a soft blur one after another: React Bits **BlurText** (`animateBy="words"`, `direction="top"`, blur 12, 140ms stagger). Screen readers get the plain sentence via `aria-label`. While the island loads, the plain headline is hidden for at most 1.4s, then revealed by CSS if the island didn't mount. | `ClientApp/src/islands/HeroTitle.tsx`, `ClientApp/src/reactbits/BlurText.tsx`, `site.css` → `fallback-reveal` | Island skipped: the server-rendered headline shows immediately, no blur (and the 1.4s hide only applies under `html.motion-ok`). |
| **Hero eyebrow shimmer** ("HANDMADE WITH LOVE IN CYPRUS") | A warm shine sweeps across the text: React Bits **ShinyText** (base `#f3d9b6`, shine `#fff8ec`, 3.5s, 1.5s delay). | `ClientApp/src/islands/ShinyEyebrow.tsx`, `ClientApp/src/reactbits/ShinyText.tsx` + `.css` | Island skipped: plain server text. (ShinyText also stops its loop itself under reduced motion.) |
| **Gift guide spotlight** | The four gift-guide tiles (For her / For the home / Under €25 / Seasonal & Christmas) on the dark espresso section get a warm spotlight that follows the pointer: React Bits **SpotlightCard** (dark theme, `rgba(242,190,132,0.28)`, size 260, intensity 0.22). Tiles lift 3px on hover. The server renders plain tiles first. | `ClientApp/src/islands/GiftGuide.tsx`, `ClientApp/src/reactbits/SpotlightCard.tsx` + `.css`, `site.css` → "Gift guide" | Spotlight still follows the pointer but snaps instantly (no easing, ambient drift or press flare); the hover lift is reduced to ~0 by the global rule. |
| **Gift-box reveal** | Above the gift sets, an SVG gift box: when it scrolls into view the bow shrinks and spins off, the ribbon unties, the lid lifts and tilts away (spring), warm light and little sparkles rise, and then the gift-set cards below fade up one by one (90ms stagger). Clicking/tapping the box ties or unties it again with a burst of star sparks (React Bits **ClickSpark**, 12 sparks in glow/honey/cream). Idle box bobs gently. Products are never hidden for long: a 4s safety timer reveals them even if the animation never runs. Built with `motion` + ClickSpark. | `ClientApp/src/islands/GiftReveal.tsx`, `ClientApp/src/reactbits/ClickSpark.tsx`, `islands.css` → "Gift box reveal", `site.css` → "Gift sets reveal" | Gift sets are shown immediately (never hidden). `MotionConfig reducedMotion="user"` drops movement from the box animation, the bob is off, and ClickSpark shows a short 320ms fade with no movement. The button still works (`aria-pressed`). |
| **Cart drawer subtotal** | The subtotal rolls from the old amount to the new one when the cart changes: React Bits **CountUp** (0.5s, 2 decimals, € prefix). Screen readers get the plain amount from a visually-hidden copy. The drawer itself slides in with a spring (`motion`), with Esc to close, focus trap and focus return. | `ClientApp/src/islands/CartView.tsx`, `CartDrawer.tsx`, `ClientApp/src/reactbits/CountUp.tsx`, `islands.css` | Subtotal is printed directly (no CountUp). The drawer appears without sliding (`MotionConfig reducedMotion="user"`). |
| **Card spotlight & tilt** | On product cards, a soft cream radial light (260px) follows the mouse, and the card tilts slightly in 3D (up to ±2.5° / ±2°, `perspective(900px)`). The photo zooms in a touch (1.035) on hover. Adapted from the React Bits SpotlightCard *technique* (pointer → CSS variables `--mx/--my`, CSS paints the light), written in vanilla TS because the cards are server-rendered Razor markup. Mouse only. | `ClientApp/src/effects/cards.ts` (`initCardSpotlight`), `site.css` → `.product-card::before` and `transform` | Spotlight still follows the pointer (it's lighting, not movement); no tilt (`--rx/--ry` not set and `transform: none`), no photo zoom. |
| **Animated scent tags** | On the product page, scent tags (e.g. "Warm cinnamon") pop in one after another (`scent-in`, 90ms stagger) and then float very gently up and down (3px, `scent-float`, 5s), each out of step. | `Pages/Products/Detail.cshtml` (`.scent-tag` with `--i`), `site.css` → "Product detail" | Only runs under `html.motion-ok`: tags are simply shown, static. |
| **Scroll reveal** | Section headings and the story block fade and rise in as they scroll into view. | `ClientApp/src/effects/cards.ts` (`initReveal`), `site.css` → `.reveal` | Shown immediately (no fade); also shown if IntersectionObserver is missing. |
| Small touches | Toast slides up (spring), toggle thumb spring, cart count pop, Instagram tile zoom, logo glow on hover, button press. | `site.css`, `islands.css` | Reduced to ~0 duration by the global rule; Instagram zoom off. |

Print: the header, footer, announcement, wax drips, evening veil, cart drawer and hero lights are hidden.

---

## 6. React Bits: licence note

Five components from [React Bits](https://reactbits.dev) by David Haz are used: **BlurText**, **ShinyText**,
**SpotlightCard**, **CountUp** and **ClickSpark**.

- They are **copied verbatim** (TypeScript default variant) into `ClientApp/src/reactbits/`, with their CSS
  files (`ShinyText.css`, `SpotlightCard.css`). Each file starts with a comment naming its source path,
  licence and copyright, and a `// @ts-nocheck` line so the strict project type-check doesn't touch the
  original code. Customisation happens only through props in our island wrappers
  (`ClientApp/src/islands/*.tsx`) and a few palette overrides in `islands.css`. Don't edit the copied files;
  if a change is needed, wrap them instead.
- **Licence:** MIT + Commons Clause, full text in `ClientApp/src/reactbits/LICENSE.md`. It allows using the
  components in an application, website or product, **including commercial ones** (like this shop), as long as
  the copyright and licence notice are kept. The Commons Clause forbids **selling, sublicensing or
  redistributing the components themselves** (alone, in a bundle, or as a ported version). Using them inside
  this website is fine; publishing them as a component pack or template is not.
- React Bits depends on the `motion` animation library (MIT), which the gift-box reveal and cart drawer also
  use directly.

Other third-party assets: Lucide icons (ISC licence, built into the `_Icons.cshtml` sprite by
`ClientApp/scripts/build-icons.mjs`), Playfair Display and Jost (SIL OFL 1.1, see section 2).
