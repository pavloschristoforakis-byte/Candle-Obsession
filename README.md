# Candle Obsession

The online shop for **Candle Obsession**, a small handmade-candle business in Cyprus ([@candleobsession__](https://www.instagram.com/candleobsession__/)). It sells scented and shaped candles, wax melts, home fragrance, gift boxes and favours, with a cart, checkout, delivery options, gift wrap and message, order emails and a small admin page.

- **Server:** ASP.NET Core 10 Razor Pages with SQLite (EF Core). All pages are rendered on the server, and every price is checked on the server.
- **Front-end:** a Vite + React "islands" bundle in `ClientApp/` that builds into `wwwroot/dist`. It adds the cart drawer, the gift guide, the gift-box reveal and the candle effects: lit-wick cards, ember, evening mode and wax drips. The site still works without JavaScript, and all motion respects `prefers-reduced-motion`.
- **Products:** one JSON file, `Data/products.json`. Product facts come only from the owner's Instagram. Anything unknown stays `null` and is listed in the product's `todo` array. **Never invent prices, scents, sizes or burn times.**

| Guide | For |
|---|---|
| [INTEGRATION.md](INTEGRATION.md) | How checkout works, connecting Stripe, payment links, Viva, Revolut or cash, delivery, gift wrap, VAT, emails, admin, and the go-live checklist |
| [HOSTING.md](HOSTING.md) | Where to host the site (Render recommended), domain setup, step-by-step deploy |
| [docs/PRODUCTS.md](docs/PRODUCTS.md) | Editing products, prices, photos and the "needs info" list |
| [docs/DESIGN.md](docs/DESIGN.md) | Design system, effects and accessibility notes |
| [.env.example](.env.example) | Every setting you can change on the host |

---

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 22 or newer](https://nodejs.org/) (includes npm)

## Run it locally

**Quickest (Windows PowerShell):** one command runs the whole site, rebuilds the front end on save and restarts
the site when C#/Razor files change. Stop with Ctrl+C; restart it after editing `Data/products.json`.

```powershell
.\dev.ps1              # http://localhost:5199, admin password printed in the window
.\dev.ps1 -Port 5300   # another port
```

If Windows says running scripts is disabled, run `powershell -ExecutionPolicy Bypass -File .\dev.ps1` instead.

**Step by step (any OS):**

```bash
# 1. Build the front-end (once, and after changing anything in ClientApp/)
cd ClientApp
npm ci
npm run build          # → ../wwwroot/dist (app.js, app.css, chunks/)
cd ..

# 2. Run the site
dotnet run --environment Development --urls http://localhost:5199
```

Then open <http://localhost:5199>.

- **The client builds automatically the first time.** If `wwwroot/dist/app.js` doesn't exist yet, `dotnet build`/`dotnet run` runs `npm ci` (when `node_modules` is missing) and `npm run build` for you. It does **not** rebuild after that, so run `npm run build` (or `npm run watch`) yourself after front-end changes. To skip the automatic step, use `dotnet build -p:SkipClientBuild=true`.
- **The database** is created automatically at `App_Data/candleobsession.db`, with migrations applied on startup. Test orders end up there. The folder is git-ignored, and you can delete the file to start fresh.
- **Ports and environment.** There is no `launchSettings.json`, so pass `--urls` and `--environment` as above. Without them the app uses port 5000 and the Production environment.

### npm scripts (run in `ClientApp/`)

| Script | What it does |
|---|---|
| `npm run build` | Type-checks (`tsc --noEmit`) and builds the production bundle into `wwwroot/dist` |
| `npm run watch` | Rebuilds `wwwroot/dist` on every change (development mode). Keep `dotnet run` running alongside and refresh the browser. |
| `npm run typecheck` | Type-check only |
| `npm run images` | Regenerates optimised product, hero and brand images (`wwwroot/images/…`, WebP in several widths) from the owner's photos in `ClientApp/assets-src` (`scripts/process-images.mjs`) |
| `npm run test:e2e` | Runs `scripts/e2e.mjs`, the browser tests (Playwright + axe accessibility checks), against the running site. Start `dotnet run` first. |

`node scripts/build-icons.mjs` regenerates the SVG icon sprite `Pages/Shared/_Icons.cshtml` from Lucide icons.

---

## Project structure

```
Program.cs                 Startup: settings, DI, SQLite, security headers/CSP, rate limiting,
                           forwarded headers, /healthz, /sitemap.xml, /robots.txt, Stripe webhook
appsettings.json           Shop settings: delivery, payment methods, gift wrap, VAT, announcement…
Data/
  products.json            ★ All products, prices, stock, photos, payment links (single source of truth)
  ApplicationDbContext.cs  Orders, order items, withdrawal requests (EF Core, SQLite)
  Migrations/
Models/                    Catalog (product JSON shape), Order, OrderItem, CheckoutRequest, WithdrawalRequest
Services/
  ProductCatalog.cs        Loads products.json, serves it to pages and to the browser
  OrderCalculator.cs       Server-side pricing and validation of every order
  OrderService.cs          Saves orders, marks them paid, sends owner emails (SMTP)
  ShopOptions.cs           The "Shop" settings
  Checkout/                ★ Payment integration point: CheckoutService + Manual, PaymentLinks,
                           StripeCheckout providers, and a template for Viva/JCC/others
Pages/
  Index                    Home: hero, collection, gift guide, gift-box reveal, story, Instagram
  Shop                     /shop?category=…&guide=…
  Products/Detail          /products/{slug}
  Cart, Checkout           /cart, /checkout (PlaceOrder JSON handler)
  OrderStatus/             /order/success/{ref}, /order/cancelled/{ref}
  Withdraw                 /withdraw (EU withdrawal form)
  Admin/                   /admin (owner dashboard, password login)
  Info/                    /shipping /returns /privacy /terms /contact /candle-care (legal DRAFTS)
  Shared/                  _Layout, _ProductCard, _Flame, _WaxDrip, _Icons, _DraftNotice
wwwroot/
  css/site.css             Design tokens and all page styles, effects, reduced-motion fallbacks
  js/boot.js               Tiny script that runs before first paint (js / motion / evening classes)
  images/, fonts/          Optimised product photos, brand images, self-hosted fonts
  dist/                    Built front-end (generated, git-ignored)
ClientApp/                 Vite + React + TypeScript source
  src/main.ts              Entry: wires up effects and lazy-loads React islands
  src/lib/                 cart (localStorage), catalog, checkout, util
  src/ui/                  shop filters, checkout page
  src/effects/             flame, ember, evening mode, card spotlight/tilt
  src/islands/             React islands (HeroTitle, GiftGuide, GiftReveal, CartDrawer, CartPage…)
  src/reactbits/           React Bits components, copied unchanged
  scripts/                 images, icons and e2e test scripts
Dockerfile, .dockerignore, render.yaml, .env.example   Deployment (see HOSTING.md)
```

---

## Where to change things

| I want to change… | Edit | Notes |
|---|---|---|
| A product, price, stock, photo or description | `Data/products.json` | `"priceEur": null` means "Price on request" (it can't be added to the cart). `stockStatus`: `in_stock`, `low_stock`, `out_of_stock`, `made_to_order`, `enquire`. See [docs/PRODUCTS.md](docs/PRODUCTS.md). |
| New product photos | `ClientApp/assets-src` + `scripts/process-images.mjs`, then `npm run images` | |
| Delivery methods or prices (ACS €5, BOX NOW €3, pickup €0, EU off) | `appsettings.json` → `Shop:DeliveryMethods` | `PriceEur: null` hides a method. See [INTEGRATION.md §7](INTEGRATION.md#7-delivery-methods-and-prices). |
| Payment methods (card / Revolut / cash) and their instructions | `appsettings.json` → `Shop:PaymentMethods` | |
| Gift wrap price or message length | `appsettings.json` → `Shop:GiftWrap` | Price is currently 0 (TODO owner) |
| VAT wording | `Shop:PricesIncludeVat` (`null` / `true` / `false`) | Currently `null`, so no VAT text is shown. Confirm with an accountant. |
| The announcement bar | `appsettings.json` → `Shop:Announcement` | `ShowUntilUtc` hides it automatically |
| Business and legal details, contact email | `Shop:LegalName`, `TradingAddress`, `VatNumber`, `ContactEmail`… | Empty until the owner provides them |
| Legal page text | `Pages/Info/*.cshtml` | Drafts. Remove `<partial name="_DraftNotice" />` once reviewed. |
| Online payments | `Checkout:Provider` + keys (env vars) | [INTEGRATION.md](INTEGRATION.md) |
| Colours, fonts, spacing | `wwwroot/css/site.css` (tokens at the top) | [docs/DESIGN.md](docs/DESIGN.md) |

After editing `products.json` or `appsettings.json`, restart the app locally, or push and redeploy on the host. Secrets (Stripe keys, SMTP password, admin password) **never** go in these files. They are set as environment variables on the host; see [.env.example](.env.example).

## Admin

Set the `Admin__Password` environment variable (on the host, or in your shell locally) and open `/admin`. While no password is set, the admin pages are switched off. The admin page lists recent orders and withdrawal requests, and lets you change order and payment status. Details in [INTEGRATION.md §10](INTEGRATION.md#10-the-admin-page-admin).

```bash
# local example (Git Bash)
Admin__Password='a-long-local-test-password' dotnet run --environment Development --urls http://localhost:5199
```

### Product editor (`/admin/products`)

Add, edit, hide, reorder and delete products without touching code: prices, availability, photos, scent details,
versions (colours/sizes), customer questions, gift guides and animations (flame on/off, flame position and size
per photo, tilt, gift-box reveal). Photos are uploaded in the editor, cropped to 4:5 and resized on the server
(Magick.NET), and camera data such as GPS location is removed.

- Saving rewrites the catalogue file (`Catalog:Path`, default `Data/products.json`) and the site updates at once.
  The previous version is kept next to it as `products.json.bak`.
- Uploaded photos go to `Catalog:ImagesPath` (default `wwwroot/images/products`).
- Locally these are files in the repo, so commit them like any other change. On a host they must be on a
  persistent disk: see [HOSTING.md](HOSTING.md#product-editor-storage).
- Code: `Pages/Admin/Products.cshtml(.cs)`, `Services/ProductEditor.cs` (checks), `Services/ProductImageStore.cs`
  (photos), `ClientApp/src/islands/admin/` (screen), `wwwroot/css/admin.css`.
- Test: `npm run test:admin` in `ClientApp` (changes data: read the header of `scripts/admin-e2e.mjs` first).

## Deploying

Nothing is deployed yet. [HOSTING.md](HOSTING.md) compares hosts and gives click-by-click steps for Render: a free test service, then about $7.25/month with a persistent disk for launch.

The `Dockerfile` builds everything (Node for the front-end, then .NET). It **has not been built locally yet** because Docker wasn't available, so watch the first build log.

```bash
docker build -t candle-obsession .
docker run -p 8080:8080 -v candle-data:/data --env-file .env candle-obsession
```
