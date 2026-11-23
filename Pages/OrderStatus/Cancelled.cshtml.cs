using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Candle_Obsession.Services.Checkout;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.RateLimiting;

namespace Candle_Obsession.Pages.OrderStatus;

/// <summary>The payment provider sends customers here when they cancel or abandon payment.</summary>
[EnableRateLimiting("forms")]
public class CancelledModel(OrderService orders, CheckoutService checkout, SiteUrls urls, StripeCheckoutProvider stripe) : PageModel
{
    public Models.Order Order { get; private set; } = null!;

    /// <summary>Provider payment page for "Try payment again". A form POST may not redirect off-site (CSP form-action 'self').</summary>
    public string? PaymentUrl { get; private set; }

    public bool CanRetry => Order.PaymentMethod == "card"
                            && Order.PaymentStatus == PaymentStatuses.AwaitingPayment
                            && Order.OrderStatus != OrderStatuses.Cancelled;

    public async Task<IActionResult> OnGetAsync(string reference, CancellationToken ct)
    {
        var order = await orders.FindAsync(reference, ct);
        if (order is null) return NotFound();
        Order = order;
        // Paid, cash and Revolut orders have nothing to retry here: the thank-you page explains their state.
        if (order.PaymentStatus is PaymentStatuses.Paid or PaymentStatuses.PayOnDelivery || order.PaymentMethod != "card")
            return Redirect($"/order/success/{order.PublicId}");
        return Page();
    }

    /// <summary>"Try payment again": starts a new payment for the same saved order.</summary>
    public async Task<IActionResult> OnPostRetryAsync(string reference, CancellationToken ct)
    {
        var order = await orders.FindAsync(reference, ct);
        if (order is null) return NotFound();
        Order = order;
        if (!CanRetry) return Redirect($"/order/success/{order.PublicId}");

        // Close the earlier Stripe session first so the customer can't end up paying twice.
        if (order.PaymentProvider == "StripeCheckout" && !string.IsNullOrEmpty(order.PaymentReference)
            && !await stripe.TryExpireAsync(order.PaymentReference, ct))
            return Redirect($"/order/success/{order.PublicId}"); // the old session is likely already paid

        var start = await checkout.StartPaymentAsync(new PaymentContext(
            order,
            urls.Absolute(HttpContext, $"/order/success/{order.PublicId}"),
            urls.Absolute(HttpContext, $"/order/cancelled/{order.PublicId}")), ct);
        await orders.SetPaymentReferenceAsync(order, start.Provider, start.PaymentReference, ct);
        if (!start.IsExternal) return Redirect(start.RedirectUrl);
        PaymentUrl = start.RedirectUrl;
        return Page();
    }
}
