# Hosting Candle Obsession

Research done on **2026-11-23**. Prices are in USD or EUR as each provider lists them, **excluding VAT** unless stated otherwise. Anything marked **(unverified)** could not be confirmed on an official page that day.

## Summary and recommendation

> **Use Render's Free web service (Frankfurt) for testing now. For launch, use a Render paid web service ($7/month) with a 1 GB persistent disk mounted at `/data` (Frankfurt). That comes to about $7.25/month.**

Why Render:

- **It runs our app as it is.** Render builds the repo's `Dockerfile` itself, so the owner doesn't need Docker, a container registry or a command line.
- **The site and its data stay in the EU.** The Frankfurt region keeps everything in Germany, and Render publishes a GDPR Data Processing Addendum.
- **Testing and launch happen in one place.** When you're ready to launch, you change the instance type and add a disk on the same service. You don't move hosts or redo DNS.
- **It does the routine work.** You get free automatic HTTPS, automatic deploys whenever `main` changes, health checks on `/healthz`, one-click rollback, pull-request previews and daily disk snapshots kept for 7 days.

What to know before choosing it:

- **Test orders are wiped often.** The Free plan has no disk, so orders disappear on every redeploy, restart or spin-down (after 15 idle minutes). Render also says the Free plan must not be used for production. Use it for testing only.
- **Deploys cause a short outage.** With a disk attached, Render stops the old copy before starting the new one, so each update means about a minute of downtime.
- **The bandwidth allowance is small.** The Hobby workspace includes 5 GB of outbound bandwidth a month, and extra costs $0.15/GB. A few hundred visitors should fit if product photos are compressed.

Runners-up:

- **Railway** (Amsterdam, $5/month Hobby plan) is the closest alternative.
- **Fly.io** is the cheapest managed option at about $4.50/month, but it is run from a command line.
- **Hetzner Cloud with Coolify** gives the most server for the money (about €6/month), but you take on running the server yourself.

**Files added for this:**

- [`Dockerfile`](Dockerfile): builds the React part (Node 22), publishes the .NET app, and runs it as a non-root user on port 8080 with the database in `/data`. **It was written without Docker on the engineer's machine, so it has not been built yet (untested locally).** The first Render build is the first real test; see [Notes for the engineer](#6-notes-for-the-engineer).
- [`.dockerignore`](.dockerignore): keeps local orders, `node_modules` and build output out of the image.
- [`render.yaml`](render.yaml): a Render Blueprint for the launch setup (Docker, Frankfurt, port 8080, `/healthz`, 1 GB disk at `/data`, and empty placeholders for the environment variables and secrets).
- [`.env.example`](.env.example): every setting the app reads, with an explanation of each.

---

## 1. Hosts that can't run this app

The app is an ASP.NET Core 10 server, so it needs a host that runs a long-lived .NET process or a Docker container. These popular free hosts only serve static files or JavaScript functions, so **none of them can run Candle Obsession**.

| Host | What its free tier runs | Can it run our ASP.NET server? | Commercial use on free tier |
|---|---|---|---|
| **Vercel** (Hobby) | Static files plus Node, Python and Go serverless functions | **No** | **Not allowed.** The terms say: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* |
| **Netlify** (Free) | Static files plus JavaScript/TypeScript functions. The plan has a 300-credit limit, unlimited deploy previews, and custom domains with SSL. | **No** | The pricing page doesn't say (unverified) |
| **Cloudflare Pages / Workers** (Free) | Static files plus JavaScript/Wasm on the Workers runtime. Cloudflare Containers can run Docker images, but only on the paid Workers plan ($5/month), and there is no persistent disk (unverified). | **No** on the free plan | Not restricted by tier (unverified). It doesn't matter here. |
| **GitHub Pages** | Static files only, with a soft limit of 100 GB/month and a 1 GB site size | **No** | **Not allowed.** *"not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site…"* |

These hosts could serve only the Vite/React "islands" as static files. The pages, cart, checkout and orders all need the C# server.

---

## 2. Free tiers that can run Docker or .NET (for testing and previews)

| Host and free tier | Sleeps when idle? | RAM / CPU | Bandwidth | Builds our Dockerfile? | PR / branch previews | Custom domain and free SSL on free tier | Persistent volume | EU region | **OK for a live shop on the free tier?** |
|---|---|---|---|---|---|---|---|---|---|
| **Render** Free web service | Yes, after **15 min** with no traffic. Waking up takes about 1 min. 750 free instance hours per month per workspace. | 512 MB | 5 GB/month on the Hobby workspace, then $0.15/GB | Yes, builds from the repo | Yes, "Service previews". Previews of a free service are free. | **Yes**, managed TLS. The Hobby workspace includes 2 custom domains. | **None on Free.** Paid disk is $0.25/GB/month on a paid instance. | **Frankfurt** | **No.** The docs say *"Do not use them for production applications."* Outbound SMTP ports 25, 465 and 587 are also blocked. |
| **Fly.io** Free plan | You choose (`auto_stop_machines`) | Up to 3 Machines. A 512 MB machine costs about $3.69/month in the US. | EU egress $0.02/GB | Yes, `fly deploy` | Not built in. You need a GitHub Action (unverified). | Yes. The first 10 certificates are free. | **Yes.** Volumes up to 5 GB on Free, $0.15/GB/month. | ams, arn, cdg, **fra**, lhr | **Not really free.** Without a card you get a one-time $1 credit that lasts 7 days. With a card you get $5 of usage a month, and once that's used up the whole month is billed at standard rates. No ban on commercial use was found (unverified). |
| **Azure App Service F1** | 60 CPU minutes a day, no Always On | 1 GB RAM, 1 GB storage | Not stated (unverified) | Yes, but you need a container registry and GitHub Actions | Deployment slots need a higher tier (unverified) | **No.** Custom domains need a paid tier (not F1). SSL is not supported on Free or Shared plans. | `/home` persists if `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`. It is network storage, so SQLite locking is a risk (unverified). | West Europe, North Europe and others | **No.** *"use of free plan for production workloads is not supported"*. There is also no custom domain. |
| **Azure App Service B1** (paid, for comparison) | No | 1 core, 1.75 GB, 10 GB storage | Not stated (unverified) | Same as above | No slots on Basic (unverified) | Yes. Free managed certificate on Basic and higher. | `/home` (same caveat) | West Europe | Paid, about **$13.14/month** (Microsoft Q&A figure, not West Europe specific; unverified) |
| **Railway** Free / Trial | Free: sleeps after 5–10 min with no outbound traffic. Trial: doesn't sleep. | Free: 0.5 GB RAM, 1 vCPU. Trial: 1 GB, 2 vCPU. | Egress $0.05/GB | Yes | **Yes**, PR environments | **Free: no custom domain.** Trial: custom domains allowed. | **Yes**, 0.5 GB on Free/Trial. Paid volumes $0.15/GB/month. | **Amsterdam** (EU West) | **No.** The Free plan gets $1/month of usage and no custom domain. The Trial is $5 one-time over 30 days, then services stop. The fair-use policy has no tier-based commercial ban. |
| **Koyeb** Free instance | Yes, scales to zero after **1 hour** without traffic | 512 MB, 0.1 vCPU, 2 GB SSD | 100 GB/month free | Yes | Not verified | Custom domains on Free not stated (unverified) | **None on Free.** Volumes are in public preview and *"currently only suitable for testing"*. | **Frankfurt** | **No.** 0.1 vCPU is very slow for .NET and there is no disk. A credit card is required. The commercial terms don't say (unverified). |
| **Google Cloud Run** | Scales to zero | Pay per use. The free quota is roughly 180k vCPU-seconds, 360k GiB-seconds and 2M requests a month (unverified, the pricing page didn't load). | 1 GiB of free egress from North America (unverified) | Yes, from a Dockerfile | Revision tags (unverified) | Domain mapping or a paid load balancer (unverified) | **No block disk.** The Cloud Storage FUSE mount *"does not provide concurrency control… (file locking)"*, so it's unsafe for SQLite. | Several EU regions | **No** for this app, because SQLite needs a real disk |
| **Northflank** Developer Sandbox | *"Always on, no sleeping"* | 2 services, 2 jobs and 1 add-on | Egress $0.06/GB | Yes | Not verified on the sandbox | Custom domains included | Paid volumes about $0.117/GiB/month | Not verified | **No.** The docs say it *"should not be used for production applications"*. A payment method is required. |
| **DigitalOcean App Platform** | No free dynamic apps. The free tier covers static sites only (3 apps). | Cheapest container: 512 MiB, 1 shared vCPU, $5/month | 50 GiB included, then $0.02/GiB | Yes | Not verified | Yes (paid) | **None.** *"App Platform does not support volumes."* | Not verified | **No.** The filesystem is ephemeral, so we would have to move to a managed database. |

**Conclusion for testing:** Render Free is the easiest no-cost place to see the real app on a public URL with HTTPS and PR previews. Its two limits are that data doesn't survive restarts and that outgoing email on port 587 is blocked.

---

## 3. Production options for a small shop (a few hundred visitors a month)

Rough monthly cost with the smallest sensible machine (512 MB–1 GB RAM) and a 1 GB persistent volume:

| Option | Approx. monthly cost | What's included / limits | SSL | EU data residency and GDPR | Ease for a non-developer owner |
|---|---|---|---|---|---|
| **Render** ★ recommended | **~$7.25**: $7 instance (0.5 CPU, 512 MB) + $0.25 for 1 GB disk. The Hobby workspace costs $0. | 5 GB/month bandwidth, then $0.15/GB. Daily disk snapshots kept 7 days. One instance only. Brief downtime on each deploy. | Free, automatic (Let's Encrypt / Google Trust Services) | Frankfurt region. DPA at render.com/dpa. Render is a US company, so transfers fall under its DPA. | **High.** Everything is done in a web dashboard and deploys run on every git push. |
| **Railway** (Hobby) | **~$5–8**. $5/month plan that includes $5 of usage. RAM costs $10/GB/month and vCPU $20/vCPU/month, so 512 MB running all the time is about $5 before CPU (estimate). Volume $0.15/GB. | Egress $0.05/GB. Volumes up to 5 GB on Hobby. PR environments. | Free | Amsterdam region. DPA at railway.com/legal/dpa. | **High.** Dashboard and GitHub. Usage-based billing is less predictable. |
| **Fly.io** | **~$4.50**. In Frankfurt a 1 GB machine is $7.73, so 512 MB is about $4.30 (estimate), plus $0.15 for the volume and EU egress at $0.02/GB. | A volume is tied to one physical server. Daily snapshots kept 5 days by default. Fly itself recommends 2+ volumes for safety. | Free (first 10 certificates) | fra, ams, cdg, arn and lhr. DPA available on request via support (community forum). | **Low–medium.** Mostly run from the `flyctl` command line. |
| **Azure App Service B1** | **~$13+** (unverified for West Europe). You may also need a container registry, or you can use the free GitHub Container Registry. | 1.75 GB RAM, 10 GB storage, `/home` persistence | Free managed certificate on Basic and higher | West Europe and North Europe. Microsoft DPA. | **Low.** The portal is complex and builds need a GitHub Actions pipeline. |
| **Koyeb** | Standard micro (512 MB) $5.36, plus any plan fee (unverified) | Volumes are still "public preview, only suitable for testing" | Free | Frankfurt | Medium. **Don't trust its volumes with orders yet.** |
| **Northflank** | ~$12 for 0.5 vCPU / 1 GB, plus a ~$0.12/GB volume | Always on. Egress $0.06/GB. | Free | EU region not verified | Medium |
| **Hetzner Cloud VPS + Coolify (or Dokploy)** | **~€6–7**. The CX23 (2 vCPU, 4 GB, 40 GB NVMe, **20 TB traffic**, IPv4 included) is €5.99. Backups add from €1.10. Coolify and Dokploy are free to self-host. | Far more power than needed. The site listed these plans as *"currently unavailable"* on 2026-11-23, so check the console. Coolify needs at least 2 CPU / 2 GB. | Free (Let's Encrypt via Coolify/Traefik) | **German company, servers in Germany and Finland.** Hetzner offers a DPA (unverified). | **Low.** See the warning below. |

**The honest cost of a VPS:** with Hetzner plus Coolify you are the system administrator. Someone has to:

- install and update Ubuntu and Docker, and keep Coolify itself updated
- set up a firewall and SSH keys
- watch disk space
- make sure backups leave the server (Hetzner backups sit at the same provider)
- fix things when the server stops responding at 2 a.m.

Coolify's dashboard makes "deploy from GitHub with a Dockerfile, a volume and free SSL" fairly easy, but nobody watches the machine for you. Pick this only if the engineer agrees to look after it.

---

## 4. Domain

### `.com.cy`

- **Registry:** *Registry .cy*, run by the **University of Cyprus** under Decree 416/2021 ([nic.cy](https://nic.cy/)). You can register directly on the registry's own portal, [registry.nic.cy](https://registry.nic.cy/cy-ui/home), so you don't need a registrar. International resellers (101domain, Openprovider, Gandi and others) also sell it, at much higher prices.
- **Who can register:** the registry FAQ says *"Individuals or organizations from any country can register a .cy domain"*, *"regardless of whether or not they are permanent residents of the Republic of Cyprus"*. It describes `.com.cy` as a *"Second Level domain name for registration by all entities"*. No local presence is needed. Some reseller pages still claim a Cyprus residency requirement, but the registry's own FAQ is authoritative.
- **Documents:** none are required up front. The registry *"will request any documentation it considers necessary"* during evaluation, typically an ID or passport for a person, or a company certificate for a business.
- **Price (direct from the registry):** **€20 for 1 year, €30 for 2 years, €50 for 5 years, VAT included.** The fees page lists these for ".cy domain names" without breaking out `.com.cy` separately (unverified that `.com.cy` costs the same). Resellers charge roughly €120–190 a year.
- **How long it takes:** the registry gives no timeline. Applications get a priority number and are checked by hand. Reseller estimates range from **up to 5 business days to about 1 month** (unverified). **Apply now** so the domain is ready before launch.
- **Nameservers:** you must give **at least two nameservers** when you apply. Options are a free DNS host such as Cloudflare DNS (Free plan), your ISP's DNS, or a Cyprus web-hosting company's DNS. If a DNS host won't accept the domain before it's registered, use your ISP's nameservers first and change them later in the registry portal.

### `.com` (optional, as a backup or redirect)

| Registrar | `.com` price per year | Notes |
|---|---|---|
| **Cloudflare Registrar** | At cost, no markup (price shown at checkout) | Free WHOIS privacy and Cloudflare DNS. `.com.cy` support not confirmed (unverified). |
| **Porkbun** | **$11.81** (registration) | Free WHOIS privacy and free SSL. Renewals at the same "everyday" price. |
| Namecheap, Gandi, etc. | about $10–20 (unverified) | Fine alternatives |

Check whether `candleobsession.com` is still available. It wasn't checked.

### Pointing the domain at the host

General rules:

- **`www.candleobsession.com.cy`:** a **CNAME** record pointing to the host's name (for example `candle-obsession.onrender.com`).
- **The bare domain (`candleobsession.com.cy`, the "apex"):** apex domains can't use a normal CNAME. Use the **A record (IP address) the host shows you**, or ALIAS/ANAME/"CNAME flattening" if your DNS host supports it (Cloudflare does).
- **Remove any old `AAAA` records** when pointing at Render. Render uses IPv4.
- **If you use Cloudflare DNS,** set the records to **"DNS only" (grey cloud)**, at least until the host has issued its certificate.
- **If you have a `CAA` record,** it must allow `letsencrypt.org` and `pki.goog`, which Render uses.
- **HTTPS is automatic.** Once DNS points at the host, Render (and Fly.io) issue and renew the certificate. This takes minutes to an hour.

| Host | `www` | Apex |
|---|---|---|
| **Render** | CNAME → `<service>.onrender.com` | The A record value shown in the Render dashboard, or ALIAS/flattened CNAME → `<service>.onrender.com`. Adding one also adds the other, with a redirect between them. |
| **Fly.io** | CNAME → the app's `.fly.dev` target from `fly certs setup` | A and AAAA records from `fly certs add` |
| **Azure** | CNAME → `<app>.azurewebsites.net`, plus TXT `asuid.www` | A record → app IP, plus TXT `asuid` |

---

## 5. Step-by-step guides

**Before you start:** the engineer must have pushed `Dockerfile`, `.dockerignore` and `render.yaml` to the `main` branch on GitHub (the `/healthz` endpoint is already in the app). You need to be signed in to the GitHub account that owns the `candle-obsession` repository.

### Guide A — Testing on Render Free (no cost)

1. **Create an account.**
   - Go to <https://dashboard.render.com/register> and choose **Sign up with GitHub**.
   - Allow Render to read your GitHub account. Your workspace will be on the **Hobby** plan, which costs nothing.
2. **Create the web service.**
   - Click **New + → Web Service**.
   - Under **Git Provider**, click **GitHub**. When GitHub asks, install the Render app and give it access to the `candle-obsession` repository only.
   - Pick the `candle-obsession` repository.
3. **Fill in the form.**
   - **Name:** `candle-obsession-test`. This becomes `candle-obsession-test.onrender.com`.
   - **Language / Runtime:** **Docker**. Render detects it from the `Dockerfile`.
   - **Branch:** `main`.
   - **Region:** **Frankfurt (EU Central)**.
   - **Root Directory:** leave empty. **Dockerfile Path:** `./Dockerfile`.
   - **Instance Type:** **Free**.
4. **Environment variables.** Click **Add Environment Variable** for each of these:

   | Key | Value for testing |
   |---|---|
   | `PORT` | `8080` |
   | `ConnectionStrings__DefaultConnection` | `Data Source=/data/candleobsession.db` (the Dockerfile already sets this, so it is optional) |
   | `Shop__BaseUrl` | `https://candle-obsession-test.onrender.com` |
   | `Checkout__Provider` | `Manual`. To try card payments, use `StripeCheckout` with Stripe **test-mode** keys (`Checkout__Stripe__SecretKey` = `sk_test_…`, `Checkout__Stripe__WebhookSecret` = `whsec_…`). See [INTEGRATION.md](INTEGRATION.md). |
   | `Admin__Password` | a long, unique password (at least 16 characters; the app refuses to start with a shorter one) |
   | `Smtp__Host`, `Smtp__Port`, `Smtp__EnableSsl`, `Smtp__User`, `Smtp__Password`, `Smtp__From`, `Shop__OrderNotificationEmail` | Your email provider's details. **Free Render services can't send on port 587, 465 or 25.** Set `Smtp__Port` to **2525** if your provider offers it (many do), or skip email while testing (orders still appear at `/admin`). |

   The full list, with explanations, is in [`.env.example`](.env.example). You don't need `ASPNETCORE_FORWARDEDHEADERS_ENABLED`: the app already trusts Render's proxy for HTTPS.

5. **Advanced settings.**
   - Set **Health Check Path** to `/healthz`.
   - Leave **Auto-Deploy** set to **On Commit**.
6. **Deploy.**
   - Click **Deploy Web Service** and watch the log. The first build takes several minutes because it builds the React part and then the .NET part.
   - When it says **Live**, open the `https://candle-obsession-test.onrender.com` link.
7. **Know the limits.**
   - After 15 minutes with no visitors the site goes to sleep. The next visit takes about a minute to wake it.
   - **Every redeploy, restart or sleep deletes all test orders.** Never take real orders here.
8. **Pull-request previews (optional).**
   - Open the service, go to the **Previews** tab, and under Pull Request Previews choose **Manual**.
   - To preview a change, add the label `render-preview` to the GitHub pull request, or put `[render preview]` in its title.
   - Render posts a separate preview URL, which costs nothing for a free service. The preview is deleted when the PR closes.
9. **Updating the test site.** Push or merge to `main` and Render rebuilds automatically. You can also use **Manual Deploy → Deploy latest commit**.

### Guide B — Launch on Render paid with a persistent disk (~$7.25/month)

There are two ways to set this up. **Option 1 is the simplest for the owner.**

#### Option 1 — Upgrade the test service in the dashboard

1. **Add a payment card.** Go to **Workspace Settings → Billing** and add a card.
2. **Change the plan.**
   - Open the `candle-obsession-test` service, then go to **Settings → Instance Type**.
   - Choose the **$7/month** size (0.5 CPU, 512 MB, formerly called "Starter") and save.
3. **Add the disk.**
   - Open the **Disks** tab and click **Add Disk**.
   - **Name:** `candle-data`. **Mount Path:** `/data`. **Size:** `1` GB.
   - Save. The service redeploys, and from now on orders are kept between deploys.
4. **Set the real settings** under **Environment**:
   - `Shop__BaseUrl` = `https://candleobsession.com.cy`
   - `Checkout__Provider` = `Manual`, `PaymentLinks` or `StripeCheckout`. Viva Smart Checkout and JCC have no built-in provider yet; the engineer must add one first (see [INTEGRATION.md](INTEGRATION.md)).
   - for Stripe, the **live** keys: `Checkout__Stripe__SecretKey` (`sk_live_…`) and `Checkout__Stripe__WebhookSecret` (`whsec_…`)
   - for payment links: `Checkout__PaymentLinks__FallbackUrl` (optional) and `Checkout__ShowBuyNowButtons` (`true`/`false`)
   - `Smtp__Port` = `587`. Paid instances can use it.
   - a new `Admin__Password`
   - your SMTP details and `Shop__OrderNotificationEmail`

   Click **Save Changes**. Render redeploys.
5. **Add your domain.**
   - Go to **Settings → Custom Domains → Add Custom Domain** and enter `candleobsession.com.cy`. Render also adds `www` and redirects one to the other.
   - At your DNS host, create the records Render shows (see [Pointing the domain](#pointing-the-domain-at-the-host)).
   - Back in Render, click **Verify**. The HTTPS certificate appears automatically, usually within an hour.
6. **Payment webhooks.** If you use Stripe (Checkout or Payment Links), add the webhook URL `https://candleobsession.com.cy/api/payments/stripe/webhook` in the Stripe dashboard with the event `checkout.session.completed`, and put its signing secret in `Checkout__Stripe__WebhookSecret`. Step-by-step in [INTEGRATION.md](INTEGRATION.md). Other providers need their own webhook added by the engineer.
7. **Test with a real order** of a cheap item, end to end: payment, the confirmation email, and the order appearing in the admin page.

#### Option 2 — Use the Blueprint file (`render.yaml`)

The repo contains `render.yaml`, which describes the launch setup: Docker, Frankfurt, the $7 plan, `/healthz`, a 1 GB disk at `/data`, and every environment variable.

1. Add a payment card under **Workspace Settings → Billing**.
2. In the Render dashboard, click **New + → Blueprint** and pick the `candle-obsession` repository.
3. Render reads `render.yaml` and asks for each secret marked `sync: false`. Fill them in, leaving any you don't use empty, then click **Apply**.
4. Do steps 5–7 from Option 1. The service is called `candle-obsession`.
5. Delete the old free test service so there's only one shop.

#### Day-to-day running (both options)

- **Deploying updates:** the engineer merges changes into `main` and Render deploys automatically.
  - Because of the disk, the site is **offline for roughly a minute** during each deploy, so deploy at quiet times.
  - If something breaks, open **Events**, pick the previous deploy and click **Rollback**.
- **Backups:**
  - Render snapshots the disk **every 24 hours and keeps snapshots for 7 days**. You can restore one from the **Disks** tab.
  - Restoring rolls back everything, so any orders placed after the snapshot are lost.
  - Ask the engineer to also set up a regular copy of the database kept off Render.
- **Watch costs:** check **Billing** monthly. Bandwidth over 5 GB costs $0.15/GB, so compress product photos.
- **GDPR:**
  - Review and accept Render's DPA ([render.com/dpa](https://render.com/dpa)).
  - List Render (hosting, Frankfurt), your payment provider and your email provider in the shop's privacy policy.

### Alternative: Fly.io (cheaper, but run from the command line)

Only if the engineer prefers it. Fly.io is configured with a `fly.toml` file. We didn't add one because Render is the recommendation. In short:

1. Run `fly launch --no-deploy` with region `fra`.
2. Create the volume: `fly volumes create candle_data --region fra --size 1`.
3. Add these sections to `fly.toml`:
   - a `[mounts]` section with `source = "candle_data"` and `destination = "/data"`
   - an `[http_service]` section with `internal_port = 8080` and `auto_stop_machines = "off"`
   - an `[[http_service.checks]]` entry with `path = "/healthz"`
4. Store secrets with `fly secrets set …`, deploy with `fly deploy`, and add the domain with `fly certs add candleobsession.com.cy`.

---

## 6. Notes for the engineer

Updated after the app code was finished (2026-11-23). The earlier notes about mismatched setting names, forwarded headers and data-protection keys have been fixed.

- **Setting names.** `render.yaml`, `.env.example` and this guide now use the names the code reads: `Shop__BaseUrl`, `Shop__OrderNotificationEmail`, `Shop__ContactEmail`, `Checkout__Provider` (`Manual` | `PaymentLinks` | `StripeCheckout`), `Checkout__ShowBuyNowButtons`, `Checkout__PaymentLinks__FallbackUrl`, `Checkout__Stripe__SecretKey`, `Checkout__Stripe__WebhookSecret`, `Admin__Password`, `Smtp__Host/Port/EnableSsl/User/Password/From` and `ConnectionStrings__DefaultConnection`. There is no `Checkout:Viva` section. Viva would be a new provider built from `Services/Checkout/TemplateHostedCheckoutProvider.cs`.
- **HTTPS behind the proxy is handled.** `Program.cs` configures `ForwardedHeadersOptions` (X-Forwarded-For and X-Forwarded-Proto, with the known-proxy lists cleared). It calls `UseForwardedHeaders()` before `UseHttpsRedirection()`. Don't also set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`. That adds a second copy of the middleware, which can let a visitor fake their IP address and get around the rate limiter.
- **Data-protection keys are handled.** They are written to a `keys` folder next to the SQLite file. With `ConnectionStrings__DefaultConnection=Data Source=/data/candleobsession.db` they live in `/data/keys` on the persistent disk and survive redeploys. On the Free plan there is no disk, so the keys reset on every restart and the admin gets logged out. That is expected.
- **Database schema.** `Database.Migrate()` runs on startup, so a new disk gets its tables automatically.
- **Health check.** `GET /healthz` returns `200 ok`. The Dockerfile has no `HEALTHCHECK` because the `aspnet` image has no `curl` or `wget`. Render uses `healthCheckPath` instead.
- **The Docker image hasn't been tested locally.** Docker wasn't installed on the machine where the `Dockerfile` was written. Watch for these in the first Render build log:
  - **Front-end stage (`node:22-alpine`).** The lockfile includes the Linux musl builds of Vite's native parts (rolldown, lightningcss) and TypeScript 7's Linux binary, so `npm ci && npm run build` should work. If a native module fails on Alpine, change the first `FROM` to `node:22-bookworm-slim`.
  - **Publish stage.** It copies `wwwroot/dist` from the Node stage before running `dotnet publish -p:SkipClientBuild=true`. `Data/products.json` is included because the `.csproj` marks it `CopyToPublishDirectory`.
  - **Disk permissions.** The image creates `/data` owned by the non-root `app` user (`$APP_UID`). Render mounts the disk over that folder, and the docs don't say whether that user can write to the mounted disk (unverified). The log might show `SQLite Error 14: unable to open database file` or "access denied" on `/data`. If so, the quick fix is to remove the `USER $APP_UID` line, and the app then runs as root inside the container.
- **Outbound email on Free.** Render Free blocks SMTP ports 25, 465 and 587. `Smtp__Port` is configurable, so use `2525` for testing if the email provider supports it. A failed email never blocks an order; it is only logged.
- **Previews and the disk.** It isn't documented whether PR previews of a disk-backed service get their own disk (unverified). Treat preview data as throwaway.

---

## Sources (checked 2026-11-23)

**Render**
- Free instances: <https://render.com/docs/free>
- Pricing (machine-readable): <https://render.com/pricing.md>
- Persistent disks and snapshots: <https://render.com/docs/disks>
- Blueprint spec: <https://render.com/docs/blueprint-spec>
- Custom domains: <https://render.com/docs/custom-domains>
- Service previews: <https://render.com/docs/service-previews>
- Deploys: <https://render.com/docs/deploys>
- Health checks: <https://render.com/docs/health-checks>
- Workspace plans: <https://render.com/docs/new-workspace-plans>
- DPA: <https://render.com/dpa>

**Fly.io**
- Pricing: <https://docs.fly.io/about/pricing>
- Free plan: <https://docs.fly.io/about/free-trial/>
- Regions: <https://docs.fly.io/reference/regions/>
- fly.toml reference: <https://docs.fly.io/reference/configuration/>
- Custom domains: <https://docs.fly.io/networking/custom-domain/>
- Volumes: <https://docs.fly.io/volumes/overview/>
- DPA (community forum): <https://community.fly.io/t/gdpr-and-dpas-we-can-help/4073>

**Azure**
- App Service Linux pricing: <https://azure.microsoft.com/en-us/pricing/details/app-service/linux/>
- Custom domain tutorial (paid tier required): <https://learn.microsoft.com/en-us/azure/app-service/app-service-web-tutorial-custom-domain>
- Custom containers and `/home` storage: <https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container>
- B1 price estimate (Microsoft Q&A): <https://learn.microsoft.com/en-us/answers/a/12322935>

**Railway**
- Plans: <https://docs.railway.com/reference/pricing/plans>
- Free trial: <https://docs.railway.com/reference/pricing/free-trial>
- Regions: <https://docs.railway.com/reference/regions>
- Environments: <https://docs.railway.com/guides/environments>
- Fair use: <https://railway.com/legal/fair-use>
- DPA: <https://railway.com/legal/dpa>

**Koyeb**
- Pricing: <https://www.koyeb.com/pricing>
- Instances: <https://www.koyeb.com/docs/reference/instances>
- Volumes: <https://www.koyeb.com/docs/reference/volumes>
- Pricing FAQ: <https://www.koyeb.com/docs/faqs/pricing>

**Google Cloud Run**
- Pricing (page content didn't load; free quota unverified): <https://cloud.google.com/run/pricing>
- Cloud Storage volume mounts: <https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts>

**Northflank**
- Pricing: <https://northflank.com/pricing>
- Sandbox: <https://northflank.com/docs/v1/application/billing/pricing-on-northflank>

**DigitalOcean App Platform**
- Pricing: <https://docs.digitalocean.com/products/app-platform/details/pricing/>
- Limits: <https://docs.digitalocean.com/products/app-platform/details/limits/>

**Static and JavaScript hosts**
- Vercel Terms: <https://vercel.com/legal/terms>
- Vercel Hobby plan: <https://vercel.com/docs/plans/hobby>
- Vercel fair use: <https://vercel.com/docs/limits/fair-use-guidelines>
- Netlify pricing: <https://www.netlify.com/pricing/>
- GitHub Pages limits: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
- Cloudflare Pages Functions: <https://developers.cloudflare.com/pages/functions/>
- Cloudflare Containers pricing: <https://developers.cloudflare.com/containers/pricing/>

**Hetzner, Coolify and Dokploy**
- Hetzner Cloud: <https://www.hetzner.com/cloud>
- Hetzner Cost-Optimized plans: <https://www.hetzner.com/cloud/cost-optimized/>
- Hetzner Regular Performance plans: <https://www.hetzner.com/cloud/regular-performance/>
- Coolify pricing: <https://coolify.io/pricing/>
- Coolify installation requirements: <https://coolify.io/docs/get-started/installation>
- Dokploy: <https://docs.dokploy.com/docs/core>

**.cy domains**
- Registry home: <https://nic.cy/>
- FAQs: <https://nic.cy/faqs/>
- Fees: <https://nic.cy/fees/>
- Registration: <https://nic.cy/registration/>
- Rules and regulations: <https://nic.cy/rules-and-regulations/>
- Registration request form (PDF): <https://nic.cy/wp-content/uploads/2026/02/request-for-domain-registration-en.pdf>
- Reseller examples (price and timing ranges): <https://www.101domain.com/com_cy.htm>, <https://support.openprovider.eu/hc/en-us/articles/360000753748--com-cy>, <https://www.imena.ua/en/domains/zones/com.cy>

**.com registrars**
- Cloudflare Registrar: <https://www.cloudflare.com/products/registrar/>
- Porkbun `.com`: <https://porkbun.com/tld/com>
