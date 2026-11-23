using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Candle_Obsession.Services.Checkout;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Pages.Products;

public class DetailModel(ProductCatalog catalog, IOptions<CheckoutOptions> checkout) : PageModel
{
    public Product Product { get; private set; } = null!;
    public IReadOnlyList<Product> Related { get; private set; } = [];
    public ProductCategory? Category { get; private set; }

    /// <summary>URL for the optional "Buy now" button (product payment link / external checkout).</summary>
    public string? BuyNowUrl { get; private set; }

    public IActionResult OnGet(string slug)
    {
        var product = catalog.FindBySlug(slug);
        if (product is null) return NotFound();
        if (!string.Equals(slug, product.Slug, StringComparison.Ordinal)) return RedirectPermanent(product.Url);

        Product = product;
        Category = catalog.Category(product.Category);
        Related = catalog.Products
            .Where(p => p != product && (p.Category == product.Category || p.Guides.Intersect(product.Guides).Any()))
            .OrderByDescending(p => p.Category == product.Category)
            .ThenByDescending(p => p.AnyPurchasable)
            .Take(4)
            .ToList();

        if (checkout.Value.ShowBuyNowButtons && !product.HasVariants && product.Options.Count == 0 && product.AnyPurchasable)
            BuyNowUrl = product.CheckoutUrl ?? product.PaymentLink;

        return Page();
    }
}
