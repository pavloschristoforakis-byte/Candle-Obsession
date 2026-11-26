using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Candle_Obsession.Data;
using Candle_Obsession.Services;
using Candle_Obsession.Services.Checkout;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---- Settings (appsettings.json, overridable with environment variables like Shop__ContactEmail) ----
builder.Services.Configure<ShopOptions>(config.GetSection(ShopOptions.SectionName));
builder.Services.Configure<CheckoutOptions>(config.GetSection(CheckoutOptions.SectionName));
builder.Services.Configure<SmtpOptions>(config.GetSection("Smtp"));
builder.Services.Configure<AdminOptions>(config.GetSection("Admin"));
if (config["Admin:Password"] is { Length: > 0 and < AdminOptions.MinPasswordLength })
    throw new InvalidOperationException(
        $"Admin__Password must be at least {AdminOptions.MinPasswordLength} characters (or empty to turn the admin pages off).");

// ---- Products: one catalogue file is the single source of truth (Data/products.json unless Catalog:Path says otherwise).
// The admin product editor (/admin/products) rewrites this file and saves uploaded photos to Catalog:ImagesPath, so on a
// host both must point at storage that survives redeploys (see HOSTING.md). A missing file is created from Data/products.json.
var catalogOptions = config.GetSection(CatalogOptions.SectionName).Get<CatalogOptions>() ?? new CatalogOptions();
string FromAppFolder(string path) => Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(builder.Environment.ContentRootPath, path));
var bundledCatalogPath = Path.Combine(builder.Environment.ContentRootPath, "Data", "products.json");
var catalogPath = FromAppFolder(catalogOptions.Path);
if (!File.Exists(catalogPath))
{
    Directory.CreateDirectory(Path.GetDirectoryName(catalogPath)!);
    File.Copy(bundledCatalogPath, catalogPath);
}

builder.Services.AddSingleton(ProductCatalog.Load(catalogPath));
var builtInImagesPath = Path.Combine(builder.Environment.WebRootPath ?? Path.Combine(builder.Environment.ContentRootPath, "wwwroot"), "images", "products");
var uploadedImagesPath = FromAppFolder(catalogOptions.ImagesPath);
builder.Services.AddSingleton(sp => new ProductImageStore(builtInImagesPath, uploadedImagesPath, sp.GetRequiredService<ILogger<ProductImageStore>>()));
builder.Services.AddScoped<OrderCalculator>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddSingleton<OrderNotifier>();
builder.Services.AddSingleton<SiteUrls>();

// ---- Checkout providers (see Services/Checkout/CheckoutService.cs and INTEGRATION.md) ----
builder.Services.AddScoped<CheckoutService>();
builder.Services.AddScoped<ICheckoutProvider, ManualCheckoutProvider>();
builder.Services.AddScoped<ICheckoutProvider, PaymentLinkCheckoutProvider>();
builder.Services.AddHttpClient<StripeCheckoutProvider>(c => c.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddScoped<ICheckoutProvider>(sp => sp.GetRequiredService<StripeCheckoutProvider>());
builder.Services.AddScoped<PaymentLinkCheckoutProvider>();

// ---- Database: SQLite file. Relative paths are resolved against the app folder. ----
var connection = new SqliteConnectionStringBuilder(
    config.GetConnectionString("DefaultConnection") ?? "Data Source=App_Data/candleobsession.db");
if (!Path.IsPathRooted(connection.DataSource))
    connection.DataSource = Path.Combine(builder.Environment.ContentRootPath, connection.DataSource);
var dataDirectory = Path.GetDirectoryName(connection.DataSource)!;
Directory.CreateDirectory(dataDirectory);
builder.Services.AddDbContext<ApplicationDbContext>(options => options.UseSqlite(connection.ToString()));

// Keep login/antiforgery keys next to the database so they survive redeploys (persistent disk).
builder.Services.AddDataProtection()
    .SetApplicationName("CandleObsession")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDirectory, "keys")));

// ---- Owner-only admin pages (/admin), enabled by setting Admin:Password ----
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/admin/login";
        options.Cookie.Name = "co_admin";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        // Changing Admin:Password ends every existing admin session.
        options.Events.OnValidatePrincipal = async ctx =>
        {
            var pw = ctx.HttpContext.RequestServices.GetRequiredService<IOptions<AdminOptions>>().Value.Password;
            var expected = AdminOptions.Fingerprint(pw);
            if (expected is null || ctx.Principal?.FindFirst(AdminOptions.FingerprintClaim)?.Value != expected)
            {
                ctx.RejectPrincipal();
                await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            }
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddRazorPages(options =>
{
    options.Conventions.AuthorizeFolder("/Admin");
    options.Conventions.AllowAnonymousToPage("/Admin/Login");
});

// Slow down abuse of the order/withdrawal/login forms. Only submissions count (page views are never
// limited), and each form area has its own budget per IP address.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("forms", context =>
    {
        if (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
            return RateLimitPartition.GetNoLimiter("read");
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";
        var area = path.StartsWith("/admin") ? "admin"
            : path.StartsWith("/withdraw") ? "withdraw"
            : path.StartsWith("/checkout") ? "checkout"
            : "other";
        return RateLimitPartition.GetFixedWindowLimiter($"{area}:{ip}",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) });
    });
    options.OnRejected = async (ctx, ct) =>
    {
        var http = ctx.HttpContext;
        http.Response.Headers.RetryAfter = ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry)
            ? ((int)Math.Ceiling(retry.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture)
            : "60";
        // The checkout script posts JSON: give it a readable message. HTML forms fall through to the
        // re-executed /not-found page, which shows a "too many attempts" message for a 429.
        if (http.Request.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) ?? false)
            await http.Response.WriteAsJsonAsync(new { message = "Too many attempts. Please wait a minute and try again." }, ct);
    };
});

// Behind Render/Fly/Azure the proxy terminates HTTPS; trust its X-Forwarded-* headers.
// The app must only be reachable through the hosting proxy. ForwardLimit = 1 takes only the entry the
// proxy itself appended. If the proxy's address range is known, list it in KnownIPNetworks instead of clearing it.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

// Create / upgrade the database schema on startup.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.Migrate();
}

app.UseForwardedHeaders();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/not-found");

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
    headers["Content-Security-Policy"] =
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
        "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    await next();
});

app.UseHttpsRedirection();

app.UseRouting();

// Fallback for files created after the build (e.g. wwwroot/dist from `npm run build`).
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.Context.Request.Path.StartsWithSegments("/dist/chunks"))
            ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
    },
});

// Photos uploaded in the admin product editor, when they are kept outside wwwroot (a persistent disk on the host).
// They are served at the same address as the built-in product photos. Names are never reused, so they can be cached.
if (app.Services.GetRequiredService<ProductImageStore>().SeparateUploadDirectory is { } uploadDirectory)
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadDirectory),
        RequestPath = "/images/products",
        OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=604800",
    });
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();
app.MapRazorPages()
   .WithStaticAssets();

string[] getHead = [HttpMethods.Get, HttpMethods.Head];

app.MapMethods("/healthz", getHead, () => Results.Text("ok"));

app.MapMethods("/robots.txt", getHead, (SiteUrls urls, HttpContext http) =>
    Results.Text($"User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /order/\n\nSitemap: {urls.Absolute(http, "/sitemap.xml")}\n", "text/plain"));

app.MapMethods("/sitemap.xml", getHead, (ProductCatalog catalog, SiteUrls urls, HttpContext http) =>
{
    var paths = new List<string> { "/", "/shop" };
    paths.AddRange(catalog.Guides.Select(g => $"/shop?guide={g.Id}"));
    paths.AddRange(catalog.Products.Select(p => p.Url));
    paths.AddRange(new[] { "/shipping", "/returns", "/terms", "/privacy", "/contact", "/candle-care" });
    var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    foreach (var path in paths)
        sb.Append("  <url><loc>").Append(System.Security.SecurityElement.Escape(urls.Absolute(http, path))).Append("</loc></url>\n");
    sb.Append("</urlset>\n");
    return Results.Text(sb.ToString(), "application/xml");
});

// Stripe webhook: marks orders as paid. Configure the endpoint in the Stripe dashboard (see INTEGRATION.md).
app.MapPost("/api/payments/stripe/webhook", async (HttpRequest request, IOptions<CheckoutOptions> options, OrderService orders, ILogger<Program> log) =>
{
    var secret = options.Value.Stripe.WebhookSecret;
    if (string.IsNullOrWhiteSpace(secret)) return Results.NotFound();

    using var reader = new StreamReader(request.Body, Encoding.UTF8);
    var payload = await reader.ReadToEndAsync();
    if (!StripeCheckoutProvider.VerifySignature(payload, request.Headers["Stripe-Signature"], secret, DateTimeOffset.UtcNow))
        return Results.BadRequest();

    using var json = System.Text.Json.JsonDocument.Parse(payload);
    var root = json.RootElement;
    if (root.GetProperty("type").GetString() is "checkout.session.completed" or "checkout.session.async_payment_succeeded")
    {
        var session = root.GetProperty("data").GetProperty("object");
        var paid = session.TryGetProperty("payment_status", out var ps) && ps.GetString() == "paid";
        var reference = session.TryGetProperty("client_reference_id", out var r) ? r.GetString() : null;
        var sessionId = session.TryGetProperty("id", out var sid) ? sid.GetString() : null;
        if (!paid || reference is null)
        {
            log.LogInformation("Stripe session completed without payment yet (ref {Reference}).", reference);
            return Results.Ok();
        }

        var order = await orders.FindAsync(reference);
        if (order is null)
        {
            log.LogWarning("Stripe payment {Session} for unknown order {Reference}.", sessionId, reference);
            return Results.Ok();
        }

        // Only mark the order paid if Stripe charged exactly this order's total, in EUR, in the session we created.
        var currency = session.TryGetProperty("currency", out var c) ? c.GetString() : null;
        long? amount = session.TryGetProperty("amount_total", out var a) && a.ValueKind == System.Text.Json.JsonValueKind.Number ? a.GetInt64() : null;
        var expectedCents = (long)Math.Round(order.Total * 100m, MidpointRounding.AwayFromZero);
        var sessionMatches = order.PaymentProvider != "StripeCheckout" || string.IsNullOrEmpty(order.PaymentReference) || order.PaymentReference == sessionId;
        if (!string.Equals(currency, "eur", StringComparison.OrdinalIgnoreCase) || amount != expectedCents || !sessionMatches)
        {
            log.LogWarning("Stripe payment {Session} does not match order {Reference}: got {Amount} {Currency}, expected {Expected} eur, stored session {Stored}. Left awaiting payment for manual review.",
                sessionId, reference, amount, currency, expectedCents, order.PaymentReference);
            await orders.NotifyPaymentMismatchAsync(order, $"Stripe session {sessionId}: {amount} {currency} (expected {expectedCents} eur).");
            return Results.Ok(); // 200 so Stripe does not retry; the owner reviews the order in /admin and the Stripe dashboard
        }

        await orders.MarkPaidAsync(reference, order.PaymentProvider ?? "StripeCheckout", sessionId);
    }

    return Results.Ok();
}).DisableAntiforgery();

app.Run();

public sealed class AdminOptions
{
    public const int MinPasswordLength = 16;
    public const string FingerprintClaim = "pwd";

    /// <summary>Password for /admin. Empty = admin pages disabled. Set with the Admin__Password environment variable.</summary>
    public string? Password { get; set; }

    /// <summary>Hash of the current password stored in the admin cookie, so a password change ends old sessions.</summary>
    public static string? Fingerprint(string? password) =>
        string.IsNullOrWhiteSpace(password)
            ? null
            : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("co-admin:" + password)));
}

/// <summary>Builds absolute URLs (canonical links, sitemap, payment return URLs).</summary>
public sealed class SiteUrls(IOptions<ShopOptions> shop)
{
    public string Base(HttpContext http)
    {
        var configured = shop.Value.BaseUrl;
        return string.IsNullOrWhiteSpace(configured)
            ? $"{http.Request.Scheme}://{http.Request.Host}"
            : configured.TrimEnd('/');
    }

    public string Absolute(HttpContext http, string path) => Base(http) + (path.StartsWith('/') ? path : "/" + path);
}
