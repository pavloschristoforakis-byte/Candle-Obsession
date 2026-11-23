using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Pages.OrderStatus;

public class SuccessModel(OrderService orders, IOptions<ShopOptions> shop) : PageModel
{
    public Models.Order Order { get; private set; } = null!;
    public ShopOptions Shop => shop.Value;
    public PaymentMethodOptions? Payment { get; private set; }
    public DeliveryMethodOptions? Delivery { get; private set; }

    public async Task<IActionResult> OnGetAsync(string reference, CancellationToken ct)
    {
        var order = await orders.FindAsync(reference, ct);
        if (order is null) return NotFound();
        Order = order;
        Payment = Shop.PaymentMethods.FirstOrDefault(p => p.Id == order.PaymentMethod);
        Delivery = Shop.DeliveryMethods.FirstOrDefault(d => d.Id == order.DeliveryMethod);
        return Page();
    }
}
