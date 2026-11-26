using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Candle_Obsession.Models;

namespace Candle_Obsession.Services;

/// <summary>One problem with a product being saved. <see cref="Field"/> matches the editor's field name.</summary>
public sealed record FieldError(string Field, string Message);

/// <summary>
/// Tidies and checks a product sent by the admin product editor before it goes into the catalogue.
/// Everything here is checked on the server, whatever the browser sent.
/// </summary>
public static partial class ProductEditor
{
    public static readonly string[] Types = ["candle", "wax-melts", "wax-decor", "diffuser", "car-freshener", "gift-set", "favours", "other"];

    public static readonly string[] StockStatuses =
        [StockStatus.InStock, StockStatus.LowStock, StockStatus.MadeToOrder, StockStatus.OutOfStock, StockStatus.Enquire];

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,59}$")]
    private static partial Regex IdRegex();

    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")]
    private static partial Regex SkuRegex();

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColourRegex();

    /// <summary>"Crème Brûlée & Fig" → "creme-brulee-fig".</summary>
    public static string Slugify(string? text, int maxLength = 60)
    {
        var sb = new StringBuilder();
        foreach (var c in (text ?? string.Empty).Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (c is (>= 'a' and <= 'z') or (>= '0' and <= '9')) sb.Append(c);
            else if (c is >= 'A' and <= 'Z') sb.Append(char.ToLowerInvariant(c));
            else if (sb.Length > 0 && sb[^1] != '-') sb.Append('-');
        }

        var slug = sb.ToString().Trim('-');
        return slug.Length > maxLength ? slug[..maxLength].Trim('-') : slug;
    }

    /// <summary>
    /// Cleans <paramref name="p"/> in place (trims text, fills in id / web address / SKU when left empty) and returns
    /// what is wrong with it. <paramref name="originalId"/> is null for a new product.
    /// </summary>
    public static List<FieldError> Prepare(Product p, string? originalId, CatalogDocument doc, ProductImageStore images)
    {
        var errors = new List<FieldError>();
        void Err(string field, string message) => errors.Add(new FieldError(field, message));

        var others = doc.Products.Where(o => !string.Equals(o.Id, originalId, StringComparison.OrdinalIgnoreCase)).ToList();
        bool IdTaken(string id) => others.Any(o => string.Equals(o.Id, id, StringComparison.OrdinalIgnoreCase));
        bool SlugTaken(string slug) => others.Any(o => string.Equals(o.Slug, slug, StringComparison.OrdinalIgnoreCase));
        var otherSkus = others.Select(o => o.Sku).Concat(others.SelectMany(o => o.Variants.Select(v => v.Sku)))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // ---- Text basics ----
        p.Name = Clean(p.Name) ?? string.Empty;
        if (p.Name.Length == 0) Err("name", "Give the product a name.");
        else if (p.Name.Length > 120) Err("name", "The name can be up to 120 characters.");

        p.ShortDescription = Clean(p.ShortDescription, multiline: false) ?? string.Empty;
        if (p.ShortDescription.Length > 200) Err("shortDescription", "The short description can be up to 200 characters.");
        p.Description = Clean(p.Description, multiline: true) ?? string.Empty;
        if (p.Description.Length > 4000) Err("description", "The description can be up to 4000 characters.");

        // ---- Id (never changes once created), web address, SKU ----
        if (originalId is not null)
        {
            p.Id = originalId;
        }
        else
        {
            p.Id = Clean(p.Id)?.ToLowerInvariant() ?? string.Empty;
            if (p.Id.Length == 0)
            {
                var baseId = Slugify(p.Name, 54);
                p.Id = baseId;
                for (var n = 2; baseId.Length > 0 && IdTaken(p.Id); n++) p.Id = $"{baseId}-{n}";
            }

            if (p.Id.Length == 0 && p.Name.Length > 0) Err("id", "Type an ID using letters and numbers (the name has none we can use).");
            else if (p.Id.Length > 0 && !IdRegex().IsMatch(p.Id)) Err("id", "The ID can only use lowercase letters, numbers and dashes.");
            else if (p.Id.Length > 0 && IdTaken(p.Id)) Err("id", "Another product already uses this ID.");
        }

        p.Slug = Clean(p.Slug)?.ToLowerInvariant() ?? string.Empty;
        if (p.Slug.Length == 0)
        {
            var baseSlug = originalId is null ? p.Id : Slugify(p.Name);
            p.Slug = baseSlug;
            for (var n = 2; baseSlug.Length > 0 && SlugTaken(p.Slug); n++) p.Slug = $"{baseSlug}-{n}";
        }

        if (p.Slug.Length > 0 && !IdRegex().IsMatch(p.Slug)) Err("slug", "The web address can only use lowercase letters, numbers and dashes.");
        else if (p.Slug.Length > 0 && SlugTaken(p.Slug)) Err("slug", "Another product already uses this web address.");

        var usedSkus = new HashSet<string>(otherSkus, StringComparer.OrdinalIgnoreCase);
        string FreeSku(string wanted)
        {
            var sku = wanted;
            for (var n = 2; usedSkus.Contains(sku); n++) sku = $"{wanted}-{n}";
            return sku;
        }

        p.Sku = Clean(p.Sku) ?? string.Empty;
        if (p.Sku.Length == 0 && p.Id.Length > 0) p.Sku = FreeSku("CO-" + Truncate(p.Id.ToUpperInvariant(), 30));
        if (p.Sku.Length > 0 && !SkuRegex().IsMatch(p.Sku)) Err("sku", "The SKU can use letters, numbers, dots, dashes and underscores (up to 40).");
        else if (usedSkus.Contains(p.Sku)) Err("sku", "Another product already uses this SKU.");
        usedSkus.Add(p.Sku);

        // ---- Where it belongs ----
        p.Category = Clean(p.Category) ?? string.Empty;
        if (doc.Categories.All(c => c.Id != p.Category)) Err("category", "Choose a category.");
        p.Type = Clean(p.Type) ?? string.Empty;
        if (!Types.Contains(p.Type)) Err("type", "Choose what kind of product this is.");

        var guideIds = doc.Guides.Select(g => g.Id).ToHashSet();
        p.Guides = (p.Guides ?? []).Where(guideIds.Contains).Distinct().ToList();

        // ---- Price and stock ----
        p.PriceEur = Money2(p.PriceEur);
        if (p.PriceEur is <= 0 or > 9999.99m) Err("priceEur", "The price must be between €0.01 and €9,999.99. Leave it empty if it isn't decided yet.");
        p.CompareAtPriceEur = Money2(p.CompareAtPriceEur);
        if (p.CompareAtPriceEur is <= 0 or > 9999.99m) Err("compareAtPriceEur", "The old price must be between €0.01 and €9,999.99.");
        else if (p.CompareAtPriceEur is { } was && (p.PriceEur is null || was <= p.PriceEur))
            Err("compareAtPriceEur", "The old price must be higher than the price. Leave it empty when there is no offer.");
        p.PriceNote = Clean(p.PriceNote);
        if (p.PriceNote?.Length > 60) Err("priceNote", "The price note can be up to 60 characters.");

        p.StockStatus = Clean(p.StockStatus) ?? string.Empty;
        if (!StockStatuses.Contains(p.StockStatus)) Err("stockStatus", "Choose an availability.");

        // ---- Scent and details ----
        p.Scent ??= new ProductScent();
        p.Scent.Tags = CleanList(p.Scent.Tags, "scent.tags", "Scent words", 12, 40, Err);
        p.Scent.Top = CleanList(p.Scent.Top, "scent.top", "Top notes", 12, 40, Err);
        p.Scent.Heart = CleanList(p.Scent.Heart, "scent.heart", "Heart notes", 12, 40, Err);
        p.Scent.Base = CleanList(p.Scent.Base, "scent.base", "Base notes", 12, 40, Err);
        p.Contents = CleanList(p.Contents, "contents", "What's inside", 20, 120, Err);

        p.Wax = Clean(p.Wax);
        p.Vessel = Clean(p.Vessel);
        p.Size = Clean(p.Size);
        if (p.Wax?.Length > 80) Err("wax", "Wax can be up to 80 characters.");
        if (p.Vessel?.Length > 80) Err("vessel", "Container can be up to 80 characters.");
        if (p.Size?.Length > 80) Err("size", "Size can be up to 80 characters.");
        if (p.WeightGrams is <= 0 or > 100_000) Err("weightGrams", "Weight must be between 1 and 100,000 grams.");
        if (p.BurnTimeHours is <= 0 or > 1000) Err("burnTimeHours", "Burn time must be between 1 and 1000 hours.");

        // ---- Versions (colours, sizes) ----
        p.Variants ??= [];
        if (p.Variants.Count > 30) Err("variants", "A product can have up to 30 versions.");
        var variantIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < p.Variants.Count; i++)
        {
            var v = p.Variants[i];
            var at = $"variants.{i}";
            v.Name = Clean(v.Name) ?? string.Empty;
            if (v.Name.Length is 0 or > 60) Err($"{at}.name", "Each version needs a name (up to 60 characters).");

            v.Id = Clean(v.Id)?.ToLowerInvariant() ?? string.Empty;
            if (v.Id.Length == 0)
            {
                var baseId = Slugify(v.Name, 40);
                v.Id = baseId;
                for (var n = 2; baseId.Length > 0 && variantIds.Contains(v.Id); n++) v.Id = $"{baseId}-{n}";
            }

            if (v.Id.Length > 0 && !IdRegex().IsMatch(v.Id)) Err($"{at}.name", "This version's ID can only use lowercase letters, numbers and dashes.");
            else if (v.Id.Length > 0 && !variantIds.Add(v.Id)) Err($"{at}.name", "Two versions have the same name or ID.");

            v.Sku = Clean(v.Sku) ?? string.Empty;
            if (v.Sku.Length == 0 && p.Sku.Length > 0 && v.Id.Length > 0)
                v.Sku = FreeSku(Truncate($"{Truncate(p.Sku, 24)}-{Truncate(v.Id.ToUpperInvariant(), 12)}", 40));
            if (v.Sku.Length > 0 && !SkuRegex().IsMatch(v.Sku)) Err($"{at}.sku", "The SKU can use letters, numbers, dots, dashes and underscores (up to 40).");
            else if (v.Sku.Length > 0 && !usedSkus.Add(v.Sku)) Err($"{at}.sku", "This SKU is already used.");

            v.Swatch = Clean(v.Swatch);
            if (v.Swatch is not null && !ColourRegex().IsMatch(v.Swatch)) Err($"{at}.swatch", "Pick the colour with the colour picker.");
            v.PriceEur = Money2(v.PriceEur);
            if (v.PriceEur is <= 0 or > 9999.99m) Err($"{at}.priceEur", "The price must be between €0.01 and €9,999.99, or empty to use the product price.");
            v.StockStatus = Clean(v.StockStatus);
            if (v.StockStatus is not null && !StockStatuses.Contains(v.StockStatus)) Err($"{at}.stockStatus", "Choose an availability.");
            v.PaymentLink = CleanUrl(v.PaymentLink, $"{at}.paymentLink", Err);
        }

        // ---- Choices the customer makes (e.g. which wine, a name to add) ----
        p.Options ??= [];
        if (p.Options.Count > 10) Err("options", "A product can have up to 10 customer choices.");
        var optionIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < p.Options.Count; i++)
        {
            var o = p.Options[i];
            var at = $"options.{i}";
            o.Label = Clean(o.Label) ?? string.Empty;
            if (o.Label.Length is 0 or > 80) Err($"{at}.label", "Each choice needs a question or label (up to 80 characters).");

            o.Id = Clean(o.Id)?.ToLowerInvariant() ?? string.Empty;
            if (o.Id.Length == 0)
            {
                var baseId = Slugify(o.Label, 40);
                o.Id = baseId;
                for (var n = 2; baseId.Length > 0 && optionIds.Contains(o.Id); n++) o.Id = $"{baseId}-{n}";
            }

            if (o.Id.Length > 0 && !IdRegex().IsMatch(o.Id)) Err($"{at}.label", "This choice's ID can only use lowercase letters, numbers and dashes.");
            else if (o.Id.Length > 0 && !optionIds.Add(o.Id)) Err($"{at}.label", "Two choices have the same label or ID.");

            o.Placeholder = Clean(o.Placeholder);
            if (o.Placeholder?.Length > 120) Err($"{at}.placeholder", "The hint can be up to 120 characters.");
            if (o.Type == "select")
            {
                o.Values = CleanList(o.Values, $"{at}.values", "Answers", 30, 80, Err);
                if (o.Values.Count == 0) Err($"{at}.values", "Add at least one answer the customer can pick.");
            }
            else if (o.Type == "text")
            {
                o.Values = [];
                if (o.MaxLength is < 1 or > 500) Err($"{at}.maxLength", "The longest answer must be between 1 and 500 characters.");
            }
            else
            {
                Err($"{at}.type", "Choose 'Pick from a list' or 'Type an answer'.");
            }
        }

        // ---- Photos and flame position ----
        p.Images ??= [];
        if (p.Images.Count > 12) Err("images", "A product can have up to 12 photos.");
        for (var i = 0; i < p.Images.Count; i++)
        {
            var img = p.Images[i];
            var at = $"images.{i}";
            img.File = Clean(img.File) ?? string.Empty;
            if (!images.Exists(img.File)) Err(at, "This photo is no longer in the library. Remove it or choose another.");
            img.Alt = Clean(img.Alt) ?? string.Empty;
            if (img.Alt.Length == 0) Err($"{at}.alt", "Describe the photo in a few words (for blind visitors and Google).");
            else if (img.Alt.Length > 200) Err($"{at}.alt", "The description can be up to 200 characters.");
            img.Source = Clean(img.Source);
            if (img.Source?.Length > 300) Err($"{at}.source", "The note can be up to 300 characters.");
            if (img.Flame is { } f)
            {
                if (!double.IsFinite(f.X) || !double.IsFinite(f.Y) || !double.IsFinite(f.Size))
                {
                    Err($"{at}.flame", "Place the flame on the photo again.");
                }
                else
                {
                    f.X = Math.Round(Math.Clamp(f.X, 0, 1), 3);
                    f.Y = Math.Round(Math.Clamp(f.Y, 0, 1), 3);
                    f.Size = Math.Round(Math.Clamp(f.Size, 0.4, 2.5), 2);
                }
            }
        }

        if (p.Images.GroupBy(i => i.File).Any(g => g.Count() > 1)) Err("images", "The same photo is added twice.");

        // ---- Payment links, notes ----
        p.PaymentLink = CleanUrl(p.PaymentLink, "paymentLink", Err);
        p.CheckoutUrl = CleanUrl(p.CheckoutUrl, "checkoutUrl", Err);
        p.InstagramSource = Clean(p.InstagramSource);
        if (p.InstagramSource?.Length > 300) Err("instagramSource", "The source note can be up to 300 characters.");
        p.Todo = CleanList(p.Todo, "todo", "Notes", 40, 300, Err);
        p.LegacyNames = CleanList(p.LegacyNames, "legacyNames", "Old names", 10, 120, Err);
        p.Effects ??= new ProductEffects();

        return errors;
    }

    private static string? Clean(string? value, bool multiline = false)
    {
        if (value is null) return null;
        var sb = new StringBuilder(value.Length);
        foreach (var c in value.Replace("\r\n", "\n"))
        {
            if (c == '\n' && multiline) sb.Append(c);
            else if (char.IsControl(c)) sb.Append(' ');
            else sb.Append(c);
        }

        var cleaned = sb.ToString().Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }

    private static List<string> CleanList(List<string>? values, string field, string label, int maxItems, int maxLength, Action<string, string> err)
    {
        var list = (values ?? []).Select(v => Clean(v)).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (list.Count > maxItems) err(field, $"{label}: up to {maxItems} entries.");
        if (list.Any(v => v.Length > maxLength)) err(field, $"{label}: each entry can be up to {maxLength} characters.");
        return list;
    }

    /// <summary>Links are shown to customers as buttons, so only real https addresses are accepted.</summary>
    private static string? CleanUrl(string? value, string field, Action<string, string> err)
    {
        var url = Clean(value);
        if (url is null) return null;
        if (url.Length > 500 || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            err(field, "Paste the full link, starting with https://");
        return url;
    }

    private static decimal? Money2(decimal? value) => value is null ? null : Math.Round(value.Value, 2, MidpointRounding.AwayFromZero);

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max].TrimEnd('-', '.', '_');
}
