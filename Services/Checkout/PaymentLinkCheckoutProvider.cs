using Candle_Obsession.Models;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Services.Checkout;

/// <summary>
/// "One payment link per product" providers (Stripe Payment Links, Viva Wallet payment links,
/// Revolut Business payment links …). Set "paymentLink" on a product or variant in Data/products.json.
///
/// A product link charges exactly the price set up at the provider, so it is only used when the
/// order is a single item with no extra charges (e.g. local pickup, no paid gift wrap). Otherwise the
/// optional Checkout:PaymentLinks:FallbackUrl is used, or the order falls back to Manual.
/// </summary>
public sealed class PaymentLinkCheckoutProvider(
    ProductCatalog catalog,
    IOptions<CheckoutOptions> options) : ICheckoutProvider
{
    private readonly PaymentLinkOptions _links = options.Value.PaymentLinks;

    public string Name => "PaymentLinks";

    public Task<PaymentStart?> StartAsync(PaymentContext context, CancellationToken ct)
    {
        var order = context.Order;
        string? link = null;

        if (order.OrderItems is [{ Quantity: 1 } only] && order.ShippingCost == 0 && order.GiftWrapCost == 0)
        {
            var product = catalog.FindById(only.ProductId);
            var variant = product?.Variants.FirstOrDefault(v => v.Sku == only.Sku);
            // Fall back to the product's link only if the variant doesn't change the price (that link charges the product price),
            // and only if the order was priced at today's catalogue price.
            link = variant?.PaymentLink
                ?? (product is not null && product.PriceFor(variant) == product.PriceEur ? product.PaymentLink : null);
            if (link is not null && only.UnitPrice != product?.PriceFor(variant)) link = null;
        }

        link ??= string.IsNullOrWhiteSpace(_links.FallbackUrl) ? null : _links.FallbackUrl;
        if (link is null) return Task.FromResult<PaymentStart?>(null);

        return Task.FromResult<PaymentStart?>(new PaymentStart(WithReference(link, order), IsExternal: true, Provider: Name));
    }

    /// <summary>Appends our order reference (and email) so the payment can be matched to the order.</summary>
    public string WithReference(string link, Order order)
    {
        var url = link;
        void Append(string? name, string value)
        {
            if (string.IsNullOrWhiteSpace(name)) return;
            url += (url.Contains('?') ? "&" : "?") + Uri.EscapeDataString(name) + "=" + Uri.EscapeDataString(value);
        }

        Append(_links.ReferenceParameter, order.PublicId);
        Append(_links.EmailParameter, order.Email);
        return url;
    }
}
