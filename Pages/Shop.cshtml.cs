using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Candle_Obsession.Pages;

public class ShopModel(ProductCatalog catalog) : PageModel
{
    [BindProperty(SupportsGet = true)] public string? Category { get; set; }
    [BindProperty(SupportsGet = true)] public string? Guide { get; set; }

    public ProductCatalog Catalog => catalog;
    public ProductCategory? ActiveCategory { get; private set; }
    public GiftGuide? ActiveGuide { get; private set; }
    public IReadOnlyList<Product> Products { get; private set; } = [];

    public void OnGet()
    {
        ActiveCategory = Category is null ? null : catalog.Category(Category);
        ActiveGuide = Guide is null ? null : catalog.Guide(Guide);

        IEnumerable<Product> products = ActiveGuide is not null ? catalog.InGuide(ActiveGuide) : catalog.Products;
        if (ActiveCategory is not null) products = products.Where(p => p.Category == ActiveCategory.Id);

        // Buyable products first, then by catalogue order.
        Products = products.OrderByDescending(p => p.AnyPurchasable).ToList();
    }
}
