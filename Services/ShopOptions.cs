namespace Candle_Obsession.Services;

/// <summary>
/// Shop-wide settings, bound from the "Shop" section of appsettings.json
/// (or environment variables such as Shop__ContactEmail).
/// Anything set to null / empty is unknown and is listed in docs/PRODUCTS.md under "Needs info".
/// </summary>
public sealed class ShopOptions
{
    public const string SectionName = "Shop";

    public string Name { get; set; } = "Candle Obsession";
    public string Tagline { get; set; } = "Handmade candles";

    /// <summary>Public base URL without trailing slash, e.g. https://candleobsession.com.cy. Used for canonical URLs, sitemap and Open Graph.</summary>
    public string? BaseUrl { get; set; }

    public string InstagramUrl { get; set; } = "https://www.instagram.com/candleobsession__/";
    public string InstagramHandle { get; set; } = "@candleobsession__";

    // --- Business / legal details (TODO owner: fill these in before launch) ---
    public string? LegalName { get; set; }
    public string? TradingAddress { get; set; }
    public string? RegistrationNumber { get; set; }
    public string? VatNumber { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }

    /// <summary>
    /// VAT display. null = not decided yet (no VAT wording is shown to customers).
    /// true = "Prices include VAT". false = "VAT not charged" (e.g. below the Cyprus registration threshold).
    /// TODO owner/accountant: confirm.
    /// </summary>
    public bool? PricesIncludeVat { get; set; }

    /// <summary>Where order notifications are emailed. Empty = only stored in the database / admin page.</summary>
    public string? OrderNotificationEmail { get; set; }

    public GiftWrapOptions GiftWrap { get; set; } = new();

    public List<DeliveryMethodOptions> DeliveryMethods { get; set; } = new();

    public List<PaymentMethodOptions> PaymentMethods { get; set; } = new();

    public AnnouncementOptions Announcement { get; set; } = new();

    /// <summary>Minimum age to buy products flagged "containsAlcohol" (wine gift boxes). TODO owner: confirm licensing.</summary>
    public int AlcoholMinimumAge { get; set; } = 18;

    public bool HasLegalDetails =>
        !string.IsNullOrWhiteSpace(LegalName) && !string.IsNullOrWhiteSpace(ContactEmail);
}

public sealed class GiftWrapOptions
{
    public bool Enabled { get; set; } = true;

    /// <summary>Gift wrap price in EUR. null = the owner has not set a price yet (TODO owner); 0 = free on purpose.</summary>
    public decimal? PriceEur { get; set; }

    /// <summary>What is actually added to an order today (0 while the price is not set).</summary>
    public decimal ChargeEur => PriceEur ?? 0m;

    /// <summary>True once the owner has set a price (0 included), so the site may state it.</summary>
    public bool PriceConfirmed => PriceEur.HasValue;

    public int MaxMessageLength { get; set; } = 250;
}

public sealed class DeliveryMethodOptions
{
    /// <summary>Stable id sent by the checkout form, e.g. "acs", "boxnow", "pickup", "eu".</summary>
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    /// <summary>Price in EUR. null = not priced yet; the method is then hidden even if Enabled.</summary>
    public decimal? PriceEur { get; set; }

    public bool Enabled { get; set; } = true;

    /// <summary>"address" (street/city/postcode), "locker" (BOX NOW locker), or "none" (pickup).</summary>
    public string Requires { get; set; } = "address";

    /// <summary>Countries this method ships to (ISO names shown in the country dropdown).</summary>
    /// <remarks>Starts empty: configuration binding adds to a list rather than replacing it.</remarks>
    public List<string> Countries { get; set; } = new();

    /// <summary>Countries actually used: the configured list, or Cyprus when none is configured.</summary>
    public IReadOnlyList<string> EffectiveCountries =>
        Countries.Count > 0 ? Countries.Distinct(StringComparer.OrdinalIgnoreCase).ToList() : new[] { "Cyprus" };

    /// <summary>Payment method ids NOT allowed with this delivery method (e.g. cash with lockers).</summary>
    public List<string> DisallowedPaymentMethods { get; set; } = new();

    /// <summary>Icon name from the site's icon set (truck, package, store, globe).</summary>
    public string Icon { get; set; } = "truck";

    public bool IsAvailable => Enabled && PriceEur is not null;
}

public sealed class PaymentMethodOptions
{
    /// <summary>"card" (online via the checkout provider), "revolut", "cash".</summary>
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
    public string Icon { get; set; } = "card";

    /// <summary>Text shown on the thank-you page for offline methods (e.g. Revolut instructions).</summary>
    public string? Instructions { get; set; }
}

public sealed class AnnouncementOptions
{
    public bool Enabled { get; set; }
    public string? Text { get; set; }
    public string? LinkText { get; set; }
    public string? LinkUrl { get; set; }

    /// <summary>Hide automatically after this date (UTC). Optional.</summary>
    public DateTime? ShowUntilUtc { get; set; }

    public bool IsVisible(DateTime utcNow) =>
        Enabled && !string.IsNullOrWhiteSpace(Text) && (ShowUntilUtc is null || utcNow <= ShowUntilUtc);
}
