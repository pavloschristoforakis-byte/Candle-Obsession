namespace Candle_Obsession.Models;

/// <summary>Shape of Data/products.json. Property names are camelCase in JSON.</summary>
public sealed class CatalogDocument
{
    public int Version { get; set; }
    public List<ProductCategory> Categories { get; set; } = new();
    public List<GiftGuide> Guides { get; set; } = new();
    public List<Product> Products { get; set; } = new();
}

public sealed class ProductCategory
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public sealed class GiftGuide
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = "gift";

    /// <summary>If set, the guide automatically includes every purchasable product at or below this price.</summary>
    public decimal? MaxPriceEur { get; set; }
}

public static class StockStatus
{
    public const string InStock = "in_stock";
    public const string LowStock = "low_stock";
    public const string OutOfStock = "out_of_stock";
    public const string MadeToOrder = "made_to_order";
    /// <summary>Not sold online yet (usually because the price is unknown). Shows "Ask about this".</summary>
    public const string Enquire = "enquire";

    public static string Label(string status) => status switch
    {
        InStock => "In stock",
        LowStock => "Only a few left",
        OutOfStock => "Sold out",
        MadeToOrder => "Made to order",
        Enquire => "Ask about this",
        _ => "Ask about this",
    };
}

public sealed class Product
{
    public string Id { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>Older names this product was saved under in customers' carts (e.g. "Strawbery").</summary>
    public List<string> LegacyNames { get; set; } = new();

    public string Category { get; set; } = string.Empty;

    /// <summary>candle | wax-melts | wax-decor | diffuser | car-freshener | gift-set | favours. Only "candle" gets the burning-wick card effect.</summary>
    public string Type { get; set; } = string.Empty;

    public string ShortDescription { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public ProductScent Scent { get; set; } = new();
    public List<string> Contents { get; set; } = new();

    public string? Wax { get; set; }
    public string? Vessel { get; set; }
    public string? Size { get; set; }
    public int? WeightGrams { get; set; }
    public int? BurnTimeHours { get; set; }

    /// <summary>Price in EUR. null = unknown, product can't be bought online.</summary>
    public decimal? PriceEur { get; set; }

    /// <summary>Free text shown instead of a price when PriceEur is null, e.g. "€15–€20".</summary>
    public string? PriceNote { get; set; }

    public decimal? CompareAtPriceEur { get; set; }
    public string StockStatus { get; set; } = Models.StockStatus.InStock;

    public List<ProductVariant> Variants { get; set; } = new();
    public List<ProductOption> Options { get; set; } = new();
    public List<ProductImage> Images { get; set; } = new();
    public List<string> Guides { get; set; } = new();

    public bool Featured { get; set; }
    public bool GiftSet { get; set; }
    public bool ContainsAlcohol { get; set; }

    /// <summary>Payment-link URL for "one payment link per product" providers (Stripe/Viva/Revolut links). See INTEGRATION.md.</summary>
    public string? PaymentLink { get; set; }

    /// <summary>Optional external checkout URL used as-is for a "Buy now" button (overrides PaymentLink on the product page).</summary>
    public string? CheckoutUrl { get; set; }

    public string? InstagramSource { get; set; }
    public List<string> Todo { get; set; } = new();

    public bool IsCandle => Type == "candle";
    public bool HasVariants => Variants.Count > 0;

    public ProductVariant? FindVariant(string? id) =>
        id is null ? null : Variants.FirstOrDefault(v => string.Equals(v.Id, id, StringComparison.OrdinalIgnoreCase));

    public decimal? PriceFor(ProductVariant? variant) => variant?.PriceEur ?? PriceEur;

    public string StockFor(ProductVariant? variant) => variant?.StockStatus ?? StockStatus;

    public bool IsPurchasable(ProductVariant? variant)
    {
        if (HasVariants && variant is null) return false;
        var stock = StockFor(variant);
        return PriceFor(variant) is > 0
               && stock is Models.StockStatus.InStock or Models.StockStatus.LowStock or Models.StockStatus.MadeToOrder;
    }

    /// <summary>Can at least one version of this product be added to the cart?</summary>
    public bool AnyPurchasable => HasVariants ? Variants.Any(IsPurchasable) : IsPurchasable(null);

    /// <summary>Lowest known price across variants (for "from €x" labels and the Under €25 guide).</summary>
    public decimal? MinPrice =>
        HasVariants
            ? Variants.Select(v => PriceFor(v)).Where(p => p is not null).DefaultIfEmpty(PriceEur).Min()
            : PriceEur;

    /// <summary>Lowest price among versions that can actually be bought (for "from €x", JSON-LD offer, Under €25 guide).</summary>
    public decimal? MinPurchasablePrice =>
        HasVariants
            ? Variants.Where(IsPurchasable).Select(v => PriceFor(v)).Min()
            : (IsPurchasable(null) ? PriceEur : null);

    /// <summary>True when the versions that can be bought have different prices ("from €x").</summary>
    public bool HasPriceRange =>
        HasVariants && Variants.Where(IsPurchasable).Select(v => PriceFor(v)).Distinct().Count() > 1;

    public bool IsSoldOut =>
        HasVariants ? Variants.All(v => StockFor(v) == Models.StockStatus.OutOfStock) : StockStatus == Models.StockStatus.OutOfStock;

    public ProductImage? MainImage => Images.FirstOrDefault();

    public string Url => $"/products/{Slug}";
}

public sealed class ProductScent
{
    /// <summary>Descriptive tags as written on Instagram/labels (e.g. "Warm cinnamon").</summary>
    public List<string> Tags { get; set; } = new();
    public List<string> Top { get; set; } = new();
    public List<string> Heart { get; set; } = new();
    public List<string> Base { get; set; } = new();

    public bool HasPyramid => Top.Count + Heart.Count + Base.Count > 0;
    public bool IsEmpty => !HasPyramid && Tags.Count == 0;
}

public sealed class ProductVariant
{
    public string Id { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>CSS colour for a colour swatch (optional).</summary>
    public string? Swatch { get; set; }

    /// <summary>Overrides the product price when set.</summary>
    public decimal? PriceEur { get; set; }

    /// <summary>Overrides the product stock status when set.</summary>
    public string? StockStatus { get; set; }

    public string? PaymentLink { get; set; }
}

public sealed class ProductOption
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;

    /// <summary>"select" (choose from Values) or "text" (free text up to MaxLength).</summary>
    public string Type { get; set; } = "select";

    public bool Required { get; set; }
    public List<string> Values { get; set; } = new();
    public int MaxLength { get; set; } = 120;
    public string? Placeholder { get; set; }
}

public sealed class ProductImage
{
    /// <summary>Base file name in wwwroot/images/products (without "-400.webp").</summary>
    public string File { get; set; } = string.Empty;
    public string Alt { get; set; } = string.Empty;

    /// <summary>Where the photo came from (for the owner; not shown to customers).</summary>
    public string? Source { get; set; }

    /// <summary>Position of the wick in the photo (0–1) for the hover flame. Omit to use the card's default wick.</summary>
    public FlamePoint? Flame { get; set; }

    public string Src(int width) => $"/images/products/{File}-{width}.webp";
    public string SrcSet => $"{Src(400)} 400w, {Src(800)} 800w, {Src(1200)} 1200w";
    public string OgImage => $"/images/products/{File}-og.jpg";
}

public sealed class FlamePoint
{
    public double X { get; set; } = 0.5;
    public double Y { get; set; } = 0.2;
}
