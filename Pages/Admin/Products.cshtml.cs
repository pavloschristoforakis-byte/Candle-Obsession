using System.Text;
using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Candle_Obsession.Pages.Admin;

/// <summary>
/// Product editor for the owner (/admin/products). The page itself is a shell; the editor is the React island
/// ClientApp/src/islands/admin/ProductAdmin.tsx, which talks to the handlers below.
/// Like every page in /Admin it needs the admin login, and every POST needs the anti-forgery token.
/// </summary>
[RequestSizeLimit(UploadLimitBytes)]
[RequestFormLimits(MultipartBodyLengthLimit = UploadLimitBytes)]
public class ProductsModel(ProductCatalog catalog, ProductImageStore images, ILogger<ProductsModel> logger) : PageModel
{
    /// <summary>A little above the 20 MB photo limit, to leave room for the rest of the upload form.</summary>
    private const long UploadLimitBytes = ProductImageStore.MaxUploadBytes + 1024 * 1024;

    public sealed class SaveRequest
    {
        /// <summary>ID of the product being edited; null when adding a new one.</summary>
        public string? OriginalId { get; set; }
        public Product? Product { get; set; }
    }

    public sealed class IdRequest
    {
        public string? Id { get; set; }
    }

    public sealed class MoveRequest
    {
        public string? Id { get; set; }

        /// <summary>-1 = earlier in the shop, 1 = later.</summary>
        public int Direction { get; set; }
    }

    public sealed class FileRequest
    {
        public string? File { get; set; }
    }

    public void OnGet()
    {
    }

    /// <summary>Everything the editor needs: products (including hidden ones), categories, guides and the photo library.</summary>
    public IActionResult OnGetData() => Json(State());

    public IActionResult OnPostSave([FromBody] SaveRequest? request)
    {
        if (request?.Product is not { } product)
            return Problem("general", "Nothing to save. Please reload the page and try again.");

        var original = request.OriginalId;
        List<FieldError> fieldErrors = [];
        var catalogErrors = catalog.Update(doc =>
        {
            if (original is not null && doc.Products.All(p => p.Id != original))
            {
                fieldErrors.Add(new FieldError("general", "This product no longer exists. Someone may have deleted it; reload the page."));
                return;
            }

            fieldErrors = ProductEditor.Prepare(product, original, doc, images);
            if (fieldErrors.Count > 0) return;

            var index = original is null ? -1 : doc.Products.FindIndex(p => p.Id == original);
            if (index >= 0) doc.Products[index] = product;
            else doc.Products.Add(product);
        }, commit: () => fieldErrors.Count == 0);

        if (fieldErrors.Count > 0) return BadRequest(new { errors = fieldErrors });
        if (catalogErrors.Count > 0) return BadRequest(new { errors = catalogErrors.Select(e => new FieldError("general", e)) });

        logger.LogInformation("Admin saved product {ProductId} ({Action})", product.Id, original is null ? "added" : "updated");
        return Json(new { savedId = product.Id, state = State() });
    }

    public IActionResult OnPostDelete([FromBody] IdRequest? request)
    {
        var id = request?.Id;
        var found = false;
        var errors = catalog.Update(doc => found = doc.Products.RemoveAll(p => p.Id == id) > 0, commit: () => found);
        if (!found) return Problem("general", "This product was already deleted.");
        if (errors.Count > 0) return BadRequest(new { errors = errors.Select(e => new FieldError("general", e)) });

        logger.LogInformation("Admin deleted product {ProductId}", id);
        return Json(new { state = State() });
    }

    /// <summary>Moves a product one place earlier or later. The shop and the home page follow this order.</summary>
    public IActionResult OnPostMove([FromBody] MoveRequest? request)
    {
        var moved = false;
        catalog.Update(doc =>
        {
            var from = doc.Products.FindIndex(p => p.Id == request?.Id);
            var to = from + Math.Sign(request?.Direction ?? 0);
            if (from < 0 || to < 0 || to >= doc.Products.Count || to == from) return;
            (doc.Products[from], doc.Products[to]) = (doc.Products[to], doc.Products[from]);
            moved = true;
        }, commit: () => moved);
        return Json(new { state = State() });
    }

    public async Task<IActionResult> OnPostUploadAsync(
        IFormFile? file, string? name, string? cropX, string? cropY, string? cropWidth, string? cropHeight, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return Problem("upload", "Choose a photo to upload.");
        if (file.Length > ProductImageStore.MaxUploadBytes) return Problem("upload", "That photo is larger than 20 MB. Please choose a smaller one.");

        // Sent as text and read with "." decimals whatever the server's language settings are.
        static double? Number(string? value) =>
            double.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : null;
        var crop = Number(cropX) is { } x && Number(cropY) is { } y && Number(cropWidth) is { } w && Number(cropHeight) is { } h
            ? new CropRect(x, y, w, h)
            : null;
        var hint = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(file.FileName) : name;

        await using var stream = file.OpenReadStream();
        var result = await images.SaveAsync(stream, hint, crop, ct);
        if (result.File is null) return Problem("upload", result.Error ?? "The upload failed. Please try again.");

        logger.LogInformation("Admin uploaded product image {File}", result.File);
        return Json(new { file = result.File, warning = result.Warning, state = State() });
    }

    public IActionResult OnPostDeleteImage([FromBody] FileRequest? request)
    {
        var file = request?.File;
        if (!ProductImageStore.IsValidName(file)) return Problem("general", "Unknown photo.");
        var users = catalog.AllProducts.Where(p => p.Images.Any(i => i.File == file)).Select(p => p.Name).ToList();
        if (users.Count > 0)
            return Problem("general", $"This photo is used by {string.Join(", ", users)}. Remove it from the product first.");
        if (!images.Delete(file!)) return Problem("general", "This photo can't be deleted here (it is part of the website's own files).");

        logger.LogInformation("Admin deleted product image {File}", file);
        return Json(new { state = State() });
    }

    /// <summary>The catalogue file, to keep as a backup or to commit to the code repository.</summary>
    public IActionResult OnGetExport() =>
        File(Encoding.UTF8.GetBytes(catalog.ExportJson()), "application/json", "products.json");

    private object State()
    {
        var all = catalog.AllProducts;
        var usedBy = all.SelectMany(p => p.Images.Select(i => (i.File, p.Name)))
            .GroupBy(x => x.File)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Name).Distinct().ToList());

        return new
        {
            products = all,
            categories = catalog.Categories,
            guides = catalog.Guides,
            types = ProductEditor.Types,
            stockStatuses = ProductEditor.StockStatuses.Select(s => new { id = s, label = StockStatus.Label(s) }),
            images = images.List().Select(i => new
            {
                file = i.File,
                canDelete = i.CanDelete,
                usedBy = usedBy.GetValueOrDefault(i.File) ?? [],
            }),
            maxUploadBytes = ProductImageStore.MaxUploadBytes,
        };
    }

    private JsonResult Json(object value) => new(value, ProductCatalog.JsonOptions);

    private BadRequestObjectResult Problem(string field, string message) =>
        BadRequest(new { errors = new[] { new FieldError(field, message) } });
}
