# Payments, delivery and orders: integration guide

This guide is for the shop owner and for whoever connects a payment provider. Each section starts in plain language and then gives the exact technical steps.

Provider facts were checked on **2026-11-23** against the sources at the end. Anything marked **(unverified)** could not be confirmed on an official page that day, so check the provider's current docs before relying on it.

Every setting below lives in `appsettings.json`, and any of them can be overridden by an environment variable on the host. A double underscore means "one level down", so `Checkout__Provider` overrides `"Checkout": { "Provider": … }`. All of them are listed and explained in [`.env.example`](.env.example). Never put secret keys in `appsettings.json` or in git. Only put them in the host's environment settings (on Render: **Service → Environment**).

---

## 1. How checkout works

**In plain words:** the customer fills in the checkout form. Our server then checks every price itself, saves the order and tells the browser where to go next. That's either our thank-you page or the payment provider's secure payment page. Because the order is saved *before* payment, no order is ever lost, even if the payment provider is down.

**Step by step:**

1. **Browser.** The cart lives in the customer's browser (`localStorage`). The checkout page (`/checkout`, code in `ClientApp/src/lib/checkout.ts`) sends the cart and the form as JSON to `POST /Checkout?handler=PlaceOrder`.
2. **Re-pricing.** `Pages/Checkout.cshtml.cs` passes it to `Services/OrderCalculator.cs`. The calculator ignores any prices sent by the browser and works everything out again from `Data/products.json` and the `Shop` settings. That covers product and variant prices, quantities, required options, delivery method and country, payment method allowed with that delivery, gift wrap price and message length, and the age check for wine. Products with `"priceEur": null` ("price on request") or that are out of stock are refused.
3. **Order saved.** `Services/OrderService.cs` stores the order in SQLite with an unguessable 22-character reference (`PublicId`). Card and Revolut orders start as `AwaitingPayment`; cash orders start as `PayOnDelivery`.
4. **Payment.**
   - **Card:** the page calls `CheckoutService.StartPaymentAsync` (`Services/Checkout/CheckoutService.cs`). This picks the provider named in `Checkout:Provider` and returns the URL to send the customer to.
   - **Revolut or cash:** there is no online step. The customer goes straight to the thank-you page.
   - If the provider is missing, can't handle the order or throws an error, the order **falls back to Manual**. The customer sees "We'll send you a secure payment link", and the owner still gets the order email.
5. **Email.** The owner gets a "New order" email (see [section 9](#9-order-emails-smtp)).
6. **Redirect.** The browser follows `redirectUrl` from the JSON reply.
   - The provider sends the customer back to `/order/success/{reference}` after paying, or to `/order/cancelled/{reference}` if they cancel. On the cancelled page they can **try the payment again** for the same order.
7. **Marked paid.** A provider webhook (Stripe: `/api/payments/stripe/webhook`) calls `OrderService.MarkPaidAsync(reference, provider, providerId)`. This marks the order `Paid` and `Confirmed` and emails the owner "Payment received". You can also mark orders paid by hand at `/admin`.

> The return URLs use `Shop:BaseUrl` when it is set. **Set `Shop__BaseUrl` to your real address** (for example `https://candleobsession.com.cy`, with no trailing slash) on the live site.

---

## 2. The single integration point and the built-in providers

All online card payments go through **one file: `Services/Checkout/CheckoutService.cs`**. You choose a provider with `Checkout:Provider` (env var `Checkout__Provider`):

| `Checkout__Provider` | What happens when a customer pays by card | Needs |
|---|---|---|
| `Manual` (default) | Order saved. The thank-you page says "We'll send you a secure payment link for €X". You send a link or request yourself (Stripe/Viva/Revolut dashboard, or an invoice). | Nothing |
| `PaymentLinks` | Sends the customer to a **ready-made payment link** you created at the provider, one per product or variant. See [section 3](#3-payment-links-one-link-per-product). | `paymentLink` values in `Data/products.json` |
| `StripeCheckout` | Creates a **Stripe Checkout** page for the whole cart: items, delivery and gift wrap, exact total. See [section 4](#4-cart-level-checkout-with-stripe-checkout). | Stripe secret key and webhook secret |

There is **no built-in Viva Wallet, JCC or Revolut Merchant provider**. `Services/Checkout/TemplateHostedCheckoutProvider.cs` is a starting template for adding one ([section 5](#5-adding-viva-smart-checkout-jcc-or-another-hosted-checkout)).

---

## 3. Payment links (one link per product)

**In plain words:** at Stripe (or Viva, or Revolut Business) you create one "payment link" per product, for example "Macademia Vanilla, €13". You paste each link into the product list. When someone orders exactly one of that product with nothing extra to pay, the shop sends them to that link.

**The catch:** a product link always charges the price you set up at the provider. It knows nothing about our delivery charge (ACS €5, BOX NOW €3) or a paid gift wrap. So the `PaymentLinks` provider only uses a product link when **all** of these are true:

- the cart has **one item, quantity 1**
- **delivery costs €0** (local pickup)
- **gift wrap costs €0**

In every other case it uses `Checkout:PaymentLinks:FallbackUrl` if you set one. That could be a "customer chooses the amount" link, and the customer then types the total shown on our thank-you page. If no fallback is set, the order falls back to **Manual** and you send a link for the exact total by hand.

**If most orders have delivery or several items, `StripeCheckout` ([section 4](#4-cart-level-checkout-with-stripe-checkout)) is the better choice.** It charges the exact cart total automatically.

### Fields in `Data/products.json`

| Field | Where | Used for |
|---|---|---|
| `paymentLink` | on a **product** and on each **variant** | Used by the `PaymentLinks` provider, which tries the variant's link first and then the product's. Also used by the "Buy now" button. |
| `checkoutUrl` | on a **product** only (variants don't have it) | Optional. Used **only** by the "Buy now" button, and takes priority over `paymentLink` there. |

Leave them `null` until you have a real link. Example:

```json
"paymentLink": "https://buy.stripe.com/test_XXXXXXXXXXXX",
"checkoutUrl": null,
```

### The "Buy now" switch (`Checkout:ShowBuyNowButtons`)

With `Checkout__ShowBuyNowButtons=true`, a product page shows a **Buy now** button that goes **straight to the provider**, using `checkoutUrl` or else `paymentLink`. It only appears on products that can be bought, have **no variants and no options**, and have a link.

> **Important:** "Buy now" skips our checkout. **No order is saved in our database or shown in `/admin`.** Delivery details, gift wrap and the Terms checkbox are not collected by us either. If you turn it on, set the link at the provider to collect the customer's name, phone and shipping address, and watch the provider's dashboard for these sales. Leave it `false` unless you want this.

### Step by step: Stripe Payment Links

1. **Create a Stripe account** (the owner does this, not the engineer) and stay in **Test mode** (the toggle in the dashboard) until everything works.
2. **Create the product and its price.** Go to **Product catalogue → Add product**. Enter the name exactly as on the site, a one-off price in **EUR** that matches `priceEur` in `products.json`, and a photo if you like. Repeat for each product or variant.
3. **Create the payment link.** Go to **Payment Links → New**, pick the product and set quantity 1.
   - Under **Options**, consider collecting the customer's phone number and address. That matters most for "Buy now".
4. **After-payment page.** Under **After the payment**, choose one of these:
   - **Keep Stripe's confirmation page** and write a custom message such as "Thank you! Your order is confirmed. We'll be in touch about delivery." This is the simplest option.
   - **Or redirect to our site**, for example `https://YOUR-DOMAIN/shop`.
     - A payment link has **one fixed redirect URL**, so it **cannot** send each customer to their own `/order/success/{reference}` page.
     - Stripe can add `{CHECKOUT_SESSION_ID}` to the redirect URL, but our site has no page that reads it yet. The engineer could add one.
5. **Copy the link** (`https://buy.stripe.com/…`) into `paymentLink` for that product or variant in `Data/products.json`, then redeploy.
6. **Order reference and email are added automatically.** The shop appends `?client_reference_id=<our order reference>&prefilled_email=<customer email>` to the link. Both are documented Stripe Payment Link URL parameters:
   - `client_reference_id` may be up to 200 letters, digits, `-` or `_`. Our references are 22 such characters. Stripe includes it in the `checkout.session.completed` webhook.
   - `prefilled_email` fills in the email field, which the customer can still change.
   - These names come from `Checkout:PaymentLinks:ReferenceParameter` and `Checkout:PaymentLinks:EmailParameter`. Set either one to `""` to stop adding it.
7. **Mark payment-link orders as paid automatically (recommended).** Set up the Stripe webhook exactly as in [section 4, step 3](#4-cart-level-checkout-with-stripe-checkout) and set `Checkout__Stripe__WebhookSecret`. You don't need a secret key for this.
   - Payment Links create Stripe Checkout Sessions that carry our `client_reference_id`, so the existing webhook marks the matching order **Paid**.
   - The admin page will show the provider as `StripeCheckout`.
   - This follows from Stripe's docs and our code, but hasn't been tried end to end yet. Test it in Test mode.
8. **Settings:**
   ```
   Checkout__Provider=PaymentLinks
   Checkout__PaymentLinks__FallbackUrl=        (optional, see above)
   Checkout__ShowBuyNowButtons=false            (true only if you want "Buy now")
   Checkout__Stripe__WebhookSecret=whsec_...   (optional but recommended)
   ```
9. **Go live:** switch Stripe to Live mode, recreate the products and links there (test links don't work live), paste the live links, and create a live webhook.

### Viva Wallet and Revolut Business payment links

These work the same way: create a link at the provider and paste it into `paymentLink`. Differences:

- **Viva "Quick Pay"** creates a permanent, reusable payment link from the Viva business dashboard (**Create your link**). Viva's help pages describe it, but we couldn't confirm whether the amount can be fixed per link or whether a reference can be passed in the URL (unverified).
  - Set `Checkout__PaymentLinks__ReferenceParameter=` and `Checkout__PaymentLinks__EmailParameter=` to empty values unless Viva documents parameters for them.
  - Orders are **not** marked paid automatically. Mark them paid in `/admin` after checking the Viva dashboard.
- **Revolut Business Payment Links** can have a fixed amount and can be single-use or reusable.
  - Links made in the dashboard send customers to Revolut's own confirmation page. A custom redirect needs Revolut's Merchant API.
  - Unknown URL parameters are probably ignored, but this isn't verified, so empty the reference/email parameters as for Viva.
  - Mark orders paid in `/admin`.

---

## 4. Cart-level checkout with Stripe Checkout

**In plain words:** instead of one link per product, the shop asks Stripe to create a payment page for **this exact cart**. That includes every candle, the delivery charge and gift wrap. The customer pays the exact total, Stripe tells our site it's paid, and the order turns **Paid** in `/admin` by itself. This is the most complete option and needs no per-product setup.

Code: `Services/Checkout/StripeCheckoutProvider.cs`. It calls Stripe's REST API directly, so no extra package is needed. Webhook: `/api/payments/stripe/webhook` in `Program.cs`.

1. **API key.** In the Stripe dashboard, in **Test mode**, go to **Developers → API keys** and copy the **Secret key** (`sk_test_…`).
   - A **restricted key** with write access to Checkout Sessions also works (unverified which exact permissions are needed).
2. **Settings** on the host:
   ```
   Checkout__Provider=StripeCheckout
   Checkout__Stripe__SecretKey=sk_test_...
   Shop__BaseUrl=https://YOUR-DOMAIN
   ```
3. **Webhook**, which marks orders as paid:
   - Go to **Developers → Webhooks → Add endpoint** (Stripe may call this an "event destination").
   - Endpoint URL: `https://YOUR-DOMAIN/api/payments/stripe/webhook`
   - Events: `checkout.session.completed`. Also add `checkout.session.async_payment_succeeded` if you enable slow payment methods such as bank debits. The code handles both.
   - Copy the **Signing secret** (`whsec_…`) into `Checkout__Stripe__WebhookSecret`.
   - The endpoint checks Stripe's signature and refuses anything older than 5 minutes. While the secret is empty, the endpoint is switched off and returns 404.
4. **Test** (Test mode). Order something with card payment and pay with **4242 4242 4242 4242**, any future expiry date, any CVC and any postcode. Check that:
   - you land on `/order/success/…`, which says payment received or confirming
   - the order shows **Paid** in `/admin` within a few seconds
   - you get the "Payment received" email
   - cancelling on Stripe's page brings you to `/order/cancelled/…` with **Try payment again**.
   - To test the webhook from your own computer, the Stripe CLI can forward events: `stripe listen --forward-to localhost:5199/api/payments/stripe/webhook`. It prints a temporary `whsec_` secret to use.
5. **Go live:**
   - Complete Stripe's account activation.
   - Switch to Live mode and replace the key with `sk_live_…`.
   - Create a **live** webhook (same URL and events) and use its new `whsec_…`.
   - Do one real, cheap order and refund it from the Stripe dashboard.

What the Stripe page shows: each item with its options summary, plus "Delivery" and "Gift wrapping" lines when they cost something, in EUR. Our order reference is sent as `client_reference_id` and in `metadata[order_public_id]`.

---

## 5. Adding Viva Smart Checkout, JCC or another hosted checkout

**In plain words:** Viva Smart Checkout (popular in Cyprus and Greece) and JCC (Cyprus banks' card gateway) work like Stripe Checkout. Our server creates a payment for the order total, the customer pays on the provider's page, and the provider tells us it's paid. We haven't built these yet because each needs a merchant account and test credentials. This is the engineer's checklist.

### Engineer checklist

1. **Copy** `Services/Checkout/TemplateHostedCheckoutProvider.cs` to, for example, `VivaSmartCheckoutProvider.cs`, rename the class and set `Name => "VivaSmartCheckout"`.
2. **Settings.** Add an options class (for example `VivaOptions { ClientId, ClientSecret, SourceCode, Demo }`) as a property on `CheckoutOptions`, so it binds from `Checkout:Viva:*`. Secrets come only from environment variables (`Checkout__Viva__ClientSecret`). Add the new keys to `.env.example` and `render.yaml` (`sync: false`).
3. **`StartAsync`.** Call the provider's "create payment/order" API with:
   - amount = `context.Order.Total` (in minor units/cents if the API wants that)
   - currency EUR
   - our reference = `context.Order.PublicId`
   - customer email = `context.Order.Email`
   - success/cancel URLs = `context.SuccessUrl` / `context.CancelUrl`, where the API accepts them

   Return `new PaymentStart(hostedPageUrl, IsExternal: true, Provider: Name, PaymentReference: providerId)`. Return `null` (or throw) to fall back to Manual.
4. **Register it in `Program.cs`** next to Stripe, the same way:
   ```csharp
   builder.Services.AddHttpClient<VivaSmartCheckoutProvider>(c => c.Timeout = TimeSpan.FromSeconds(20));
   builder.Services.AddScoped<ICheckoutProvider>(sp => sp.GetRequiredService<VivaSmartCheckoutProvider>());
   ```
5. **Webhook.** Add an endpoint next to the Stripe one (for example `app.MapPost("/api/payments/viva/webhook", …).DisableAntiforgery();`). It should:
   - verify the request really came from the provider
   - **confirm the payment with the provider's API** (never trust the redirect alone)
   - then call `await orders.MarkPaidAsync(publicId, "VivaSmartCheckout", transactionId);` (`OrderService`, which is safe to call twice).
6. **CSP.** Not needed for a redirect. The first checkout uses `fetch` and then a script navigation (`location.assign`), which `form-action 'self'` does not govern. A *form POST* that redirects off-site **is** blocked by `form-action 'self'`, so the "Try payment again" button on `/order/cancelled/{ref}` deliberately returns a normal link to the provider's page instead of redirecting. Only change the `Content-Security-Policy` in `Program.cs` if you embed the provider's page or scripts.
7. **Enable it** with `Checkout__Provider=VivaSmartCheckout` and test it in the provider's demo/sandbox environment.

### Viva Smart Checkout basics

From Viva's developer docs, checked 2026-11-23. Viva's developer site was slow to load that day, so details marked (unverified) came from search summaries and need re-checking.

- **The flow:** (1) create a payment order, (2) redirect the customer to Smart Checkout, (3) Viva redirects back to your Success or Failure URL, (4) **verify** the payment. Viva explicitly says not to rely only on the success redirect.
- **Create the order:** `POST /checkout/v2/orders` on `api.vivapayments.com` (live) or `demo-api.vivapayments.com` (demo), with OAuth2 authentication. The response contains a 16-digit `orderCode`, which is used for one payment only.
  - Request fields: amount in cents, `customerTrns`, `merchantTrns`, `customer.email`, `sourceCode` (unverified).
  - OAuth2 token: the token URL and the client-credentials grant need confirming in Viva's docs (unverified).
  - Put our `PublicId` in `merchantTrns` so the webhook can find the order (unverified that it comes back in the webhook).
- **Redirect:** `https://www.vivapayments.com/web/checkout?ref={orderCode}` (live), or the demo domain for testing.
- **Success and Failure URLs** are not sent per order. They are set on the **payment source** for your website in the Viva business dashboard. Viva adds the transaction id as `t` to the URL.
  - Because they are fixed, set the Success URL to a page that looks the order up, for example a new `/order/viva-return?t=…` page. That page doesn't exist yet. It would map the transaction to our order and then redirect to `/order/success/{PublicId}`.
- **Webhooks:** set up in the Viva dashboard under **Settings → API Access → Webhooks**.
  - The **Transaction Payment Created** event confirms a successful payment.
  - **Order Updated** fires when an order is cancelled.
  - Viva also checks your webhook URL with a GET request that must return a verification key (unverified).
  - Confirm each payment with the **Retrieve Transaction** API before calling `MarkPaidAsync`.

### JCC

JCC wasn't researched for this guide (unverified). Ask JCC for their hosted payment page (redirect) integration docs and test credentials. You need the "create payment / register order" call, the return URLs, and how payment is confirmed (callback or status API). Then follow the same checklist above.

---

## 6. Revolut and cash orders

These don't go through a payment provider.

- **Revolut** (`PaymentMethods` id `revolut`): the order is saved as `AwaitingPayment`. The thank-you page shows the Revolut `Instructions` text from `appsettings.json` ("We will send you a Revolut payment request or link…").
  - Send a Revolut request or link for the order total, using the amount in the order email or `/admin`.
  - When it's paid, open the order in `/admin` and set the payment status to **Paid**.
- **Cash on delivery** (`cash`): saved as `PayOnDelivery`, and the thank-you page shows the cash instructions. Mark it **Paid** in `/admin` when you've been paid.
  - Cash isn't allowed with BOX NOW lockers or EU shipping. See `DisallowedPaymentMethods` below.
- To switch a method off, set its `"Enabled": false` in `Shop:PaymentMethods`. To rename it or change its wording, edit `Name`, `Description` or `Instructions`.

---

## 7. Delivery methods and prices

Delivery methods live in `appsettings.json` under `Shop:DeliveryMethods`. Edit them there and redeploy.

| Id | Shown as | Price | Status |
|---|---|---|---|
| `acs` | ACS Courier, to an address in Cyprus | €5.00 | on |
| `boxnow` | BOX NOW parcel locker | €3.00 | on, no cash |
| `pickup` | Local pickup in Cyprus | €0.00 | on |
| `eu` | EU shipping | `null` (not priced) | **off** |

Fields:

- `PriceEur` is in euros. `null` means not priced yet, and the method is **hidden** even if `Enabled` is true.
- `Enabled` switches the method on or off.
- `Requires` sets which details the customer must give:
  - `address`: street, city and postcode
  - `locker`: the BOX NOW locker name or ID
  - `none`: nothing extra
- `Countries` lists the countries in the country dropdown for that method.
- `DisallowedPaymentMethods` lists payment ids that can't be used with this method, for example `[ "cash" ]`.
- `Name` and `Description` are the text customers see.

To turn on EU shipping, set a real `PriceEur` and `"Enabled": true`, and check the `Countries` list. Single values can also be overridden with environment variables using the list position, for example `Shop__DeliveryMethods__0__PriceEur=5.50` for the first method (ACS). Editing `appsettings.json` is clearer.

The browser shows the same prices, but **the server always recalculates them** (`OrderCalculator`), so a changed price applies to the next order immediately after redeploy.

---

## 8. Gift wrap, VAT display, announcement

- **Gift wrap** (`Shop:GiftWrap`):
  - `Enabled` shows the "Gift this" option at checkout.
  - `PriceEur` is the price. `null` (current) means **not decided yet: TODO, the owner must set the real price**. While it is `null` the checkout shows no price label for gift wrap and nothing is charged for it. Set `0` only if gift wrap is free on purpose (the site then says "Free").
  - `MaxMessageLength` is the longest gift message allowed (250 characters).
  - The gift message is printed in the order email and in `/admin`.
- **VAT wording** (`Shop:PricesIncludeVat`). Prices are shown exactly as entered in `products.json`. This setting only controls the VAT wording. Confirm the right choice with your accountant.
  - `null` (current): VAT not decided, so **no VAT text is shown** anywhere.
  - `true`: "Prices include VAT" in the footer, at checkout and in the Terms.
  - `false`: the "VAT not charged" wording, for example while below the Cyprus VAT registration threshold.
- **Announcement bar** (`Shop:Announcement`):
  - `Enabled`, `Text`, `LinkText` and `LinkUrl` control the bar.
  - `ShowUntilUtc` hides it automatically after that date and time.
- **Legal details** (`Shop:LegalName`, `TradingAddress`, `RegistrationNumber`, `VatNumber`, `ContactEmail`, `ContactPhone`) fill in the contact and legal pages. They are empty until the owner provides them, and the legal pages are drafts until a lawyer has reviewed them.

---

## 9. Order emails (SMTP)

**In plain words:** the site emails you when an order is placed, and again when an online payment is confirmed. It sends these through your normal email account's outgoing server (SMTP). If email isn't set up, nothing breaks: orders are still saved and visible at `/admin`.

| Setting | Example | Notes |
|---|---|---|
| `Shop__OrderNotificationEmail` | `you@example.com` | Who receives the emails. Empty = no emails. |
| `Smtp__Host` | `smtp.your-provider.com` | Empty = email off |
| `Smtp__Port` | `587` | **Render's Free plan blocks 25, 465 and 587.** Use `2525` there if your provider supports it. Paid Render instances can use 587. |
| `Smtp__EnableSsl` | `true` | TLS. Keep `true`. |
| `Smtp__User` / `Smtp__Password` | | Your SMTP login. Many providers want an **app password**, not your normal password. |
| `Smtp__From` | `orders@your-domain` | The sender address. Most providers require it to be an address you own and have verified. |

- Emails go **to the owner only**. Customers currently get no automatic confirmation email; they see the thank-you page.
- If sending fails, the error is written to the log and the order still goes through.
- The emails use .NET's built-in `SmtpClient`, which supports STARTTLS on 587/2525. Implicit TLS on port 465 isn't supported by `SmtpClient` (unverified for every provider), so prefer 587 or 2525.

---

## 10. The admin page (`/admin`)

- **Switching it on:** set `Admin__Password` to a long, unique password. While it's empty, `/admin` is **switched off** and nobody can log in.
- **Logging in:** go to `https://YOUR-DOMAIN/admin`. You stay logged in for 8 hours. The login cookie is `HttpOnly` and `SameSite=Strict`.
  - Login keys are stored in `/data/keys` next to the database, so redeploys don't log you out on a host with a persistent disk.
- **What it shows:**
  - the latest 200 orders, with customer, delivery, items, gift message and totals
  - the latest 50 withdrawal requests from `/withdraw`
- **What you can do:**
  - change an order's status (`New → Confirmed → Shipped → Completed`, or `Cancelled`)
  - change its payment status (`AwaitingPayment`, `PayOnDelivery`, `Paid`, `Refunded`, `Cancelled`)
  - mark a withdrawal request as handled
- Refunds are made in the payment provider's dashboard. `/admin` only records them.
- The order forms and `/admin/login` are rate limited to 10 form submissions per minute per IP address, per form (page views are not counted). After 5 wrong admin passwords in 15 minutes, admin login is paused for everyone for 15 minutes. `Admin__Password` must be at least 16 characters, and changing it signs out every existing admin session.

---

## 11. Testing checklist before going live

**Settings**

- [ ] `Shop__BaseUrl` is the real `https://` domain. Open `/sitemap.xml` and check that the links use it.
- [ ] `Admin__Password` is set and long. `/admin` logs in, and a wrong password is refused.
- [ ] Legal details, `Shop__ContactEmail` and the legal page drafts are reviewed. Remove the draft notices once a lawyer has approved the text.
- [ ] Delivery prices, the gift wrap price and the VAT wording are confirmed with the owner and accountant.
- [ ] Every product that should be buyable has a real `priceEur` and the right `stockStatus`. Everything else stays "price on request". Never guess a price.

**Orders**, done on the live site in test mode where possible:

- [ ] Card + ACS delivery: correct total (items + €5) on our page **and** on the provider's page.
- [ ] Card + BOX NOW: the locker is required and cash isn't offered.
- [ ] Card + pickup + gift wrap + gift message: the message appears in the email and in `/admin`.
- [ ] Revolut and cash orders show their instructions on the thank-you page.
- [ ] Cancel on the provider's page: `/order/cancelled/…` appears and "Try payment again" works.
- [ ] Webhook: the order turns **Paid** by itself. In Stripe → Webhooks the delivery attempts show `200`.
- [ ] Provider switched off or failing (for example a wrong key): the order is still saved and the customer sees the "We'll send you a payment link" message.
- [ ] A wine gift box asks for the age confirmation.
- [ ] A "price on request" or out-of-stock product can't be ordered.
- [ ] Order email and "Payment received" email arrive (and aren't in spam).
- [ ] `/withdraw` works and the request appears in `/admin`.

**Go-live switch**

- [ ] Switch the provider to **live** keys and a **live** webhook, using a new `whsec_`. Recreate payment links in live mode.
- [ ] Place one real, cheap order end to end, then refund it from the provider's dashboard and mark it `Refunded` in `/admin`.
- [ ] Back up the database: on Render, check that daily disk snapshots are running.

---

## Sources (checked 2026-11-23)

- Stripe: Payment Links URL parameters (`client_reference_id`, up to 200 alphanumeric/`-`/`_` characters, sent in `checkout.session.completed`): <https://docs.stripe.com/payment-links/url-parameters>
- Stripe: Customize checkout for Payment Links (`prefilled_email`, `locked_prefilled_email`, the example link that uses both parameters): <https://docs.stripe.com/payment-links/customize>
- Stripe: After a payment link payment (confirmation page or redirect, `{CHECKOUT_SESSION_ID}` in the redirect URL, `checkout.session.completed` webhook): <https://docs.stripe.com/payment-links/post-payment>
- Stripe: Create a Checkout Session (API used by `StripeCheckoutProvider`): <https://docs.stripe.com/api/checkout/sessions/create>
- Stripe: Fulfil orders after a customer pays (`checkout.session.async_payment_succeeded`): <https://docs.stripe.com/checkout/fulfillment>
- Stripe: Verify webhook signatures manually: <https://docs.stripe.com/webhooks#verify-manually>
- Stripe: Test cards: <https://docs.stripe.com/testing>
- Viva: Smart Checkout integration (flow, Success/Failure URLs on the payment source, `t` parameter, verify the payment): <https://developer.viva.com/smart-checkout/smart-checkout-integration/>
- Viva: Create a payment order: <https://developer.viva.com/tutorials/payments/create-a-payment-order/>
- Viva: Transaction Payment Created webhook: <https://developer.viva.com/webhooks-for-payments/transaction-payment-created/>
- Viva: Order Updated webhook: <https://developer.viva.com/webhooks-for-payments/order-updated/>
- Viva: Source for online payments: <https://euhelp.viva.com/en/articles/10154969-source-for-online-payments>
- Viva: Quick Pay (payment links): <https://euhelp.viva.com/en/articles/5221014-getting-started-with-quick-pay> and <https://developer.viva.com/payment-tools/quick-pay/>
- Revolut: Payment link (Merchant API, fixed amount, payment limit, `redirect_url` via API): <https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/payment-link>
- Revolut Business Payment Links (Cyprus): <https://www.revolut.com/en-CY/business/payment-links/>
- Render: free instances block outbound SMTP ports 25, 465 and 587: <https://render.com/docs/free>
