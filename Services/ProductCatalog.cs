using System.Text.Json;
using System.Text.Json.Serialization;
using Candle_Obsession.Models;

namespace Candle_Obsession.Services;

/// <summary>
/// Loads Data/products.json, the single source of truth for products, once at startup.
/// The server always re-prices orders from this catalogue; prices sent by the browser are ignored.
/// </summary>
public sealed class ProductCatalog
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Dictionary<string, Product> _byId;
    private readonly Dictionary<string, Product> _bySlug;
    private readonly Dictionary<string, Product> _byLegacyName;

    public IReadOnlyList<Product> Products { get; }
    public IReadOnlyList<ProductCategory> Categories { get; }
    public IReadOnlyList<GiftGuide> Guides { get; }

    public ProductCatalog(CatalogDocument doc)
    {
        Validate(doc);
        Products = doc.Products;
        Categories = doc.Categories;
        Guides = doc.Guides;
        _byId = doc.Products.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase);
        _bySlug = doc.Products.ToDictionary(p => p.Slug, StringComparer.OrdinalIgnoreCase);
        _byLegacyName = new(StringComparer.OrdinalIgnoreCase);
        foreach (var p in doc.Products)
        {
            _byLegacyName.TryAdd(p.Name, p);
            foreach (var legacy in p.LegacyNames) _byLegacyName.TryAdd(legacy, p);
        }
    }

    public static ProductCatalog Load(string path)
    {
        using var stream = File.OpenRead(path);
        var doc = JsonSerializer.Deserialize<CatalogDocument>(stream, JsonOptions)
                  ?? throw new InvalidOperationException($"{path} is empty.");
        return new ProductCatalog(doc);
    }

    public Product? FindById(string? id) => id is not null && _byId.TryGetValue(id, out var p) ? p : null;
    public Product? FindBySlug(string? slug) => slug is not null && _bySlug.TryGetValue(slug, out var p) ? p : null;

    /// <summary>Carts saved by the old site stored product names only.</summary>
    public Product? FindByLegacyName(string? name) => name is not null && _byLegacyName.TryGetValue(name, out var p) ? p : null;

    public ProductCategory? Category(string id) => Categories.FirstOrDefault(c => c.Id == id);
    public GiftGuide? Guide(string id) => Guides.FirstOrDefault(g => g.Id == id);

    public IEnumerable<Product> InGuide(GiftGuide guide) =>
        guide.MaxPriceEur is { } max
            ? Products.Where(p => p.MinPurchasablePrice <= max)
            : Products.Where(p => p.Guides.Contains(guide.Id));

    public IEnumerable<Product> Featured => Products.Where(p => p.Featured);

    /// <summary>Compact JSON for the browser (cart drawer, checkout summary). No owner-only fields.</summary>
    public string ToClientJson()
    {
        var items = Products.Select(p => new
        {
            id = p.Id,
            slug = p.Slug,
            name = p.Name,
            legacyNames = p.LegacyNames,
            type = p.Type,
            url = p.Url,
            image = p.MainImage?.Src(400),
            price = p.PriceEur,
            priceNote = p.PriceNote,
            stock = p.StockStatus,
            purchasable = p.AnyPurchasable,
            containsAlcohol = p.ContainsAlcohol,
            variants = p.Variants.Select(v => new
            {
                id = v.Id,
                name = v.Name,
                price = p.PriceFor(v),
                stock = p.StockFor(v),
                purchasable = p.IsPurchasable(v),
                swatch = v.Swatch,
            }),
            options = p.Options.Select(o => new
            {
                id = o.Id,
                label = o.Label,
                type = o.Type,
                required = o.Required,
                values = o.Values,
                maxLength = o.MaxLength,
            }),
        });
        return JsonSerializer.Serialize(items, JsonOptions);
    }

    private static void Validate(CatalogDocument doc)
    {
        var errors = new List<string>();
        void Unique(string what, IEnumerable<string> values)
        {
            foreach (var dup in values.GroupBy(v => v, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
                errors.Add($"Duplicate {what}: {dup.Key}");
        }

        Unique("product id", doc.Products.Select(p => p.Id));
        Unique("slug", doc.Products.Select(p => p.Slug));
        Unique("SKU", doc.Products.Select(p => p.Sku).Concat(doc.Products.SelectMany(p => p.Variants.Select(v => v.Sku))));

        var categories = doc.Categories.Select(c => c.Id).ToHashSet();
        var guides = doc.Guides.Select(g => g.Id).ToHashSet();
        foreach (var p in doc.Products)
        {
            if (string.IsNullOrWhiteSpace(p.Id) || string.IsNullOrWhiteSpace(p.Slug) || string.IsNullOrWhiteSpace(p.Name))
                errors.Add($"Product '{p.Id}' needs id, slug and name.");
            if (!categories.Contains(p.Category)) errors.Add($"Product '{p.Id}' has unknown category '{p.Category}'.");
            foreach (var g in p.Guides.Where(g => !guides.Contains(g))) errors.Add($"Product '{p.Id}' has unknown guide '{g}'.");
            if (p.PriceEur is < 0) errors.Add($"Product '{p.Id}' has a negative price.");
            Unique($"variant id in '{p.Id}'", p.Variants.Select(v => v.Id));
            Unique($"option id in '{p.Id}'", p.Options.Select(o => o.Id));
        }

        if (errors.Count > 0)
            throw new InvalidOperationException("Data/products.json is invalid:\n - " + string.Join("\n - ", errors));
    }
}
