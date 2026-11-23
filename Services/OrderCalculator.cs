using Candle_Obsession.Models;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Services;

/// <summary>
/// Validates a checkout request against the catalogue and shop settings and works out the totals.
/// The browser shows the same numbers, but only these server-side numbers are ever charged.
/// </summary>
public sealed class OrderCalculator(ProductCatalog catalog, IOptions<ShopOptions> shopOptions)
{
    private readonly ShopOptions _shop = shopOptions.Value;

    public sealed record PricedLine(
        Product Product, ProductVariant? Variant, string? OptionsSummary, decimal UnitPrice, int Quantity)
    {
        public decimal Total => UnitPrice * Quantity;
    }

    public sealed record Quote(
        IReadOnlyList<PricedLine> Lines,
        DeliveryMethodOptions Delivery,
        PaymentMethodOptions Payment,
        decimal Subtotal,
        decimal Shipping,
        decimal GiftWrapCost,
        bool ContainsAlcohol)
    {
        public decimal Total => Subtotal + Shipping + GiftWrapCost;
    }

    /// <summary>Returns a quote, or an error message suitable for showing to the customer.</summary>
    public (Quote? Quote, string? Error) Calculate(CheckoutRequest request)
    {
        if (request.Items is not { Count: > 0 }) return (null, "Your cart is empty.");
        if (!request.AcceptTerms) return (null, "Please accept the Terms of Sale to place your order.");

        var delivery = _shop.DeliveryMethods.FirstOrDefault(d => d.Id == request.DeliveryMethod && d.IsAvailable);
        if (delivery is null) return (null, "Please choose a delivery method.");

        var payment = _shop.PaymentMethods.FirstOrDefault(p => p.Id == request.PaymentMethod && p.Enabled);
        if (payment is null) return (null, "Please choose a payment method.");
        if (delivery.DisallowedPaymentMethods.Contains(payment.Id))
            return (null, $"{payment.Name} isn't available with {delivery.Name}.");

        switch (delivery.Requires)
        {
            case "address":
                if (string.IsNullOrWhiteSpace(request.Address) || string.IsNullOrWhiteSpace(request.City) ||
                    string.IsNullOrWhiteSpace(request.PostalCode))
                    return (null, "Please complete your delivery address.");
                var country = string.IsNullOrWhiteSpace(request.Country) ? "Cyprus" : request.Country;
                if (!delivery.EffectiveCountries.Contains(country, StringComparer.OrdinalIgnoreCase))
                    return (null, $"{delivery.Name} doesn't deliver to {country}.");
                break;
            case "locker":
                if (string.IsNullOrWhiteSpace(request.Locker)) return (null, "Please enter your BOX NOW locker.");
                break;
        }

        var giftMessage = request.GiftMessage?.Trim();
        if (request.GiftWrap && !_shop.GiftWrap.Enabled) return (null, "Gift wrapping isn't available right now.");
        if (giftMessage is { Length: > 0 } && giftMessage.Length > _shop.GiftWrap.MaxMessageLength)
            return (null, $"Gift messages can be up to {_shop.GiftWrap.MaxMessageLength} characters.");

        var lines = new List<PricedLine>();
        foreach (var item in request.Items)
        {
            if (item is null || item.Quantity is < 1 or > 100) return (null, "Invalid quantity in your cart.");

            var product = catalog.FindById(item.ProductId) ?? catalog.FindByLegacyName(item.Name);
            if (product is null)
                return (null, "One of the products in your cart is no longer available. Please refresh your cart.");

            var variant = product.FindVariant(item.VariantId);
            if (product.HasVariants && variant is null) return (null, $"Please choose an option for {product.Name}.");
            if (!product.IsPurchasable(variant))
                return (null, $"{product.Name} can't be ordered online right now. Please message us about it.");

            var (summary, optionError) = ValidateOptions(product, item.Options);
            if (optionError is not null) return (null, optionError);

            var price = product.PriceFor(variant)!.Value;
            var existing = lines.FindIndex(l => l.Product == product && l.Variant == variant && l.OptionsSummary == summary);
            if (existing >= 0)
            {
                var merged = lines[existing] with { Quantity = lines[existing].Quantity + item.Quantity };
                if (merged.Quantity > 100) return (null, "Invalid quantity in your cart.");
                lines[existing] = merged;
            }
            else
            {
                lines.Add(new PricedLine(product, variant, summary, price, item.Quantity));
            }
        }

        var containsAlcohol = lines.Any(l => l.Product.ContainsAlcohol);
        if (containsAlcohol && !request.AgeConfirmed)
            return (null, $"Your cart contains wine. Please confirm you are {_shop.AlcoholMinimumAge} or older.");

        var subtotal = lines.Sum(l => l.Total);
        var giftWrapCost = request.GiftWrap ? _shop.GiftWrap.ChargeEur : 0m;
        return (new Quote(lines, delivery, payment, subtotal, delivery.PriceEur!.Value, giftWrapCost, containsAlcohol), null);
    }

    private static (string? Summary, string? Error) ValidateOptions(Product product, Dictionary<string, string>? chosen)
    {
        chosen ??= new();
        var parts = new List<string>();
        foreach (var option in product.Options)
        {
            var value = chosen.FirstOrDefault(kv => string.Equals(kv.Key, option.Id, StringComparison.OrdinalIgnoreCase)).Value?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                if (option.Required) return (null, $"Please choose \"{option.Label}\" for {product.Name}.");
                continue;
            }

            if (option.Type == "select")
            {
                var match = option.Values.FirstOrDefault(v => string.Equals(v, value, StringComparison.OrdinalIgnoreCase));
                if (match is null) return (null, $"Invalid choice for \"{option.Label}\" ({product.Name}).");
                value = match;
            }
            else if (value.Length > option.MaxLength)
            {
                return (null, $"\"{option.Label}\" can be up to {option.MaxLength} characters.");
            }

            parts.Add($"{option.Label}: {value}");
        }

        var unknown = chosen.Keys.Except(product.Options.Select(o => o.Id), StringComparer.OrdinalIgnoreCase).Any();
        if (unknown) return (null, $"Invalid options for {product.Name}.");
        return (parts.Count == 0 ? null : string.Join(" · ", parts), null);
    }
}
