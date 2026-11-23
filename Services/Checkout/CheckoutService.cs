// ╔══════════════════════════════════════════════════════════════════════════════════════╗
// ║  PAYMENT PROVIDER INTEGRATION POINT                                                   ║
// ║                                                                                        ║
// ║  Every online ("card") payment goes through CheckoutService.StartPaymentAsync below.  ║
// ║  Pick a provider with the setting  Checkout:Provider  (env var Checkout__Provider):   ║
// ║                                                                                        ║
// ║    Manual           – no online payment yet. Order is saved, customer sees "we'll     ║
// ║                       send you a payment link". (Default.)                             ║
// ║    PaymentLinks     – one payment link per product/variant (Stripe Payment Links,      ║
// ║                       Viva payment links, Revolut Business links …), set in           ║
// ║                       Data/products.json → "paymentLink".                               ║
// ║    StripeCheckout   – cart-level checkout: creates a Stripe Checkout Session for the   ║
// ║                       whole order (needs Checkout:Stripe:SecretKey).                    ║
// ║                                                                                        ║
// ║  To add another cart-level provider (Viva Smart Checkout, JCC …): copy                 ║
// ║  TemplateHostedCheckoutProvider.cs, fill in the API call, register it in Program.cs.   ║
// ║  Step-by-step guide: INTEGRATION.md                                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════════════╝
using Candle_Obsession.Models;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Services.Checkout;

public sealed class CheckoutOptions
{
    public const string SectionName = "Checkout";

    /// <summary>Manual | PaymentLinks | StripeCheckout (or the Name of any registered ICheckoutProvider).</summary>
    public string Provider { get; set; } = "Manual";

    /// <summary>Show "Buy now" buttons (straight to the product's payment link) on product pages.</summary>
    public bool ShowBuyNowButtons { get; set; }

    public PaymentLinkOptions PaymentLinks { get; set; } = new();
    public StripeOptions Stripe { get; set; } = new();
}

public sealed class PaymentLinkOptions
{
    /// <summary>Query parameter used to pass our order reference to the provider (Stripe: client_reference_id). Empty = don't append.</summary>
    public string ReferenceParameter { get; set; } = "client_reference_id";

    /// <summary>Query parameter used to prefill the customer's email (Stripe: prefilled_email). Empty = don't append.</summary>
    public string EmailParameter { get; set; } = "prefilled_email";

    /// <summary>
    /// Used when the cart can't be paid with a single product link (several products, extra shipping…),
    /// e.g. a "customer chooses amount" link. Empty = fall back to Manual (we send a payment link by hand).
    /// </summary>
    public string? FallbackUrl { get; set; }
}

public sealed class StripeOptions
{
    public string? SecretKey { get; set; }
    public string? WebhookSecret { get; set; }
}

/// <summary>What the checkout page should do after the order has been saved.</summary>
public sealed record PaymentStart(string RedirectUrl, bool IsExternal, string Provider, string? PaymentReference = null);

/// <summary>Everything a provider needs to start a payment for a saved order.</summary>
public sealed record PaymentContext(Order Order, string SuccessUrl, string CancelUrl);

public interface ICheckoutProvider
{
    /// <summary>Matches Checkout:Provider in configuration.</summary>
    string Name { get; }

    /// <summary>Return where to send the customer to pay, or null if this provider can't handle the order (falls back to Manual).</summary>
    Task<PaymentStart?> StartAsync(PaymentContext context, CancellationToken ct);
}

public sealed class CheckoutService(
    IEnumerable<ICheckoutProvider> providers,
    IOptions<CheckoutOptions> options,
    ILogger<CheckoutService> logger)
{
    private readonly CheckoutOptions _options = options.Value;

    public string ActiveProvider => _options.Provider;

    /// <summary>
    /// Starts online payment for a saved order. Only called for PaymentMethod == "card".
    /// Revolut and cash orders go straight to the thank-you page (see Pages/Checkout.cshtml.cs).
    /// </summary>
    public async Task<PaymentStart> StartPaymentAsync(PaymentContext context, CancellationToken ct = default)
    {
        var provider = providers.FirstOrDefault(p => string.Equals(p.Name, _options.Provider, StringComparison.OrdinalIgnoreCase));
        if (provider is null)
        {
            logger.LogWarning("Unknown Checkout:Provider '{Provider}', using Manual.", _options.Provider);
        }
        else
        {
            try
            {
                var start = await provider.StartAsync(context, ct);
                if (start is not null) return start;
                logger.LogInformation("{Provider} can't take order {Order}; falling back to Manual.", provider.Name, context.Order.PublicId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Never lose an order because the payment provider is down: the order is saved,
                // the customer is told we'll send a payment link, and the owner gets the order email.
                logger.LogError(ex, "{Provider} failed for order {Order}; falling back to Manual.", provider.Name, context.Order.PublicId);
            }
        }

        return new PaymentStart(context.SuccessUrl, IsExternal: false, Provider: "Manual");
    }
}

/// <summary>No online payment: the owner sends a payment link/request by hand.</summary>
public sealed class ManualCheckoutProvider : ICheckoutProvider
{
    public string Name => "Manual";

    public Task<PaymentStart?> StartAsync(PaymentContext context, CancellationToken ct) =>
        Task.FromResult<PaymentStart?>(new PaymentStart(context.SuccessUrl, IsExternal: false, Provider: Name));
}
