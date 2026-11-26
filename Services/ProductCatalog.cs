using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Candle_Obsession.Models;

namespace Candle_Obsession.Services;

/// <summary>
/// The product catalogue: one JSON file (Data/products.json by default) is the single source of truth.
/// It is loaded at startup and replaced in one step whenever the admin product editor saves, so pages
/// always see a complete, validated catalogue. The server always re-prices orders from this catalogue;
/// prices sent by the browser are ignored.
/// </summary>
public sealed class ProductCatalog
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>For writing the catalogue file: indented, and "€" or "'" stay readable (it is a file, not HTML).</summary>
    private static readonly JsonSerializerOptions FileJsonOptions = new(JsonOptions)
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>One immutable view of the catalogue. A save builds a new one and swaps it in.</summary>
    private sealed class Snapshot
    {
        public required CatalogDocument Doc { get; init; }
        public required IReadOnlyList<Product> Visible { get; init; }
        public required Dictionary<string, Product> ById { get; init; }
        public required Dictionary<string, Product> BySlug { get; init; }
        public required Dictionary<string, Product> ByLegacyName { get; init; }
        public required Lazy<string> ClientJson { get; init; }
    }

    private readonly string? _path;
    private readonly object _writeGate = new();
    private volatile Snapshot _current;

    public ProductCatalog(CatalogDocument doc, string? path = null)
    {
        var errors = Validate(doc);
        if (errors.Count > 0)
            throw new InvalidOperationException($"{path ?? "The product catalogue"} is invalid:\n - " + string.Join("\n - ", errors));
        _path = path;
        _current = Build(doc);
    }

    public static ProductCatalog Load(string path)
    {
        CatalogDocument doc;
        using (var stream = File.OpenRead(path))
        {
            doc = JsonSerializer.Deserialize<CatalogDocument>(stream, JsonOptions)
                  ?? throw new InvalidOperationException($"{path} is empty.");
        }

        return new ProductCatalog(doc, path);
    }

    /// <summary>Products shown on the website (hidden ones are left out).</summary>
    public IReadOnlyList<Product> Products => _current.Visible;

    /// <summary>Every product, including hidden ones. For the admin editor only.</summary>
    public IReadOnlyList<Product> AllProducts => _current.Doc.Products;

    public IReadOnlyList<ProductCategory> Categories => _current.Doc.Categories;
    public IReadOnlyList<GiftGuide> Guides => _current.Doc.Guides;

    public Product? FindById(string? id) => id is not null && _current.ById.TryGetValue(id, out var p) ? p : null;
    public Product? FindBySlug(string? slug) => slug is not null && _current.BySlug.TryGetValue(slug, out var p) ? p : null;

    /// <summary>Carts saved by the old site stored product names only.</summary>
    public Product? FindByLegacyName(string? name) => name is not null && _current.ByLegacyName.TryGetValue(name, out var p) ? p : null;

    public ProductCategory? Category(string id) => Categories.FirstOrDefault(c => c.Id == id);
    public GiftGuide? Guide(string id) => Guides.FirstOrDefault(g => g.Id == id);

    public IEnumerable<Product> InGuide(GiftGuide guide) =>
        guide.MaxPriceEur is { } max
            ? Products.Where(p => p.MinPurchasablePrice <= max)
            : Products.Where(p => p.Guides.Contains(guide.Id));

    public IEnumerable<Product> Featured => Products.Where(p => p.Featured);

    /// <summary>Compact JSON for the browser (cart drawer, checkout summary). No owner-only fields.</summary>
    public string ToClientJson() => _current.ClientJson.Value;

    /// <summary>The whole catalogue file as indented JSON (admin "Download a backup").</summary>
    public string ExportJson() => JsonSerializer.Serialize(_current.Doc, FileJsonOptions);

    /// <summary>
    /// Applies a change from the admin editor: works on a copy, validates it, writes the file, then swaps it in.
    /// Returns the list of problems; an empty list means the change was saved. If <paramref name="commit"/> is
    /// given and returns false after the change ran, nothing is saved (the caller found its own problems).
    /// </summary>
    public IReadOnlyList<string> Update(Action<CatalogDocument> change, Func<bool>? commit = null)
    {
        lock (_writeGate)
        {
            var draft = Clone(_current.Doc);
            change(draft);
            if (commit is not null && !commit()) return [];
            var errors = Validate(draft);
            if (errors.Count > 0) return errors;

            if (_path is not null)
            {
                try
                {
                    // Write next to the real file and swap, so a crash mid-write can't leave half a catalogue.
                    var temp = _path + ".tmp";
                    File.WriteAllText(temp, JsonSerializer.Serialize(draft, FileJsonOptions));
                    if (File.Exists(_path)) File.Copy(_path, _path + ".bak", overwrite: true);
                    File.Move(temp, _path, overwrite: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    return [$"The server could not save the catalogue file ({ex.Message}). Nothing was changed. " +
                            "Check that Catalog:Path points to a folder the site can write to (see HOSTING.md)."];
                }
            }

            _current = Build(draft);
            return [];
        }
    }

    private static CatalogDocument Clone(CatalogDocument doc) =>
        JsonSerializer.Deserialize<CatalogDocument>(JsonSerializer.Serialize(doc, JsonOptions), JsonOptions)!;

    private static Snapshot Build(CatalogDocument doc)
    {
        var visible = doc.Products.Where(p => !p.Hidden).ToList();
        var byLegacyName = new Dictionary<string, Product>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in visible)
        {
            byLegacyName.TryAdd(p.Name, p);
            foreach (var legacy in p.LegacyNames) byLegacyName.TryAdd(legacy, p);
        }

        return new Snapshot
        {
            Doc = doc,
            Visible = visible,
            ById = visible.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase),
            BySlug = visible.ToDictionary(p => p.Slug, StringComparer.OrdinalIgnoreCase),
            ByLegacyName = byLegacyName,
            ClientJson = new Lazy<string>(() => BuildClientJson(visible)),
        };
    }

    private static string BuildClientJson(IReadOnlyList<Product> products)
    {
        var items = products.Select(p => new
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

    /// <summary>Rules the whole catalogue must meet (the admin editor checks each product in more detail first).</summary>
    private static List<string> Validate(CatalogDocument doc)
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

        return errors;
    }
}
