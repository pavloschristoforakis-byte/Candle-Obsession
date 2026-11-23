using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Services.Checkout;

/// <summary>
/// Cart-level checkout with Stripe Checkout Sessions (https://docs.stripe.com/api/checkout/sessions/create).
/// Uses Stripe's REST API directly, so no extra NuGet package is needed.
///
/// Settings: Checkout:Provider = StripeCheckout, Checkout:Stripe:SecretKey = sk_test_… / sk_live_…,
///           Checkout:Stripe:WebhookSecret = whsec_… (from the webhook you create in the Stripe dashboard,
///           pointing at https://YOUR-DOMAIN/api/payments/stripe/webhook, event checkout.session.completed).
/// Test with sk_test_ keys and card 4242 4242 4242 4242 before going live.
/// </summary>
public sealed class StripeCheckoutProvider(
    HttpClient http,
    IOptions<CheckoutOptions> options,
    ILogger<StripeCheckoutProvider> logger) : ICheckoutProvider
{
    private readonly StripeOptions _stripe = options.Value.Stripe;

    public string Name => "StripeCheckout";

    public async Task<PaymentStart?> StartAsync(PaymentContext context, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_stripe.SecretKey))
        {
            logger.LogWarning("Checkout:Stripe:SecretKey is not set.");
            return null;
        }

        var order = context.Order;
        var form = new List<KeyValuePair<string, string>>
        {
            new("mode", "payment"),
            new("success_url", context.SuccessUrl),
            new("cancel_url", context.CancelUrl),
            new("client_reference_id", order.PublicId),
            new("customer_email", order.Email),
            new("metadata[order_public_id]", order.PublicId),
            new("payment_intent_data[metadata][order_public_id]", order.PublicId),
        };

        var i = 0;
        void Line(string name, string? description, decimal unitPrice, int quantity)
        {
            form.Add(new($"line_items[{i}][quantity]", quantity.ToString(CultureInfo.InvariantCulture)));
            form.Add(new($"line_items[{i}][price_data][currency]", "eur"));
            form.Add(new($"line_items[{i}][price_data][unit_amount]", ToCents(unitPrice)));
            form.Add(new($"line_items[{i}][price_data][product_data][name]", name));
            if (!string.IsNullOrWhiteSpace(description))
                form.Add(new($"line_items[{i}][price_data][product_data][description]", description));
            i++;
        }

        foreach (var item in order.OrderItems) Line(item.DisplayName, item.OptionsSummary, item.UnitPrice, item.Quantity);
        if (order.ShippingCost > 0) Line("Delivery", null, order.ShippingCost, 1);
        if (order.GiftWrapCost > 0) Line("Gift wrapping", null, order.GiftWrapCost, 1);

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.stripe.com/v1/checkout/sessions")
        {
            Content = new FormUrlEncodedContent(form),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _stripe.SecretKey);

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Stripe returned {Status}: {Body}", (int)response.StatusCode, body);
            return null;
        }

        using var json = JsonDocument.Parse(body);
        var url = json.RootElement.GetProperty("url").GetString()!;
        var id = json.RootElement.GetProperty("id").GetString();
        return new PaymentStart(url, IsExternal: true, Provider: Name, PaymentReference: id);
    }

    /// <summary>Expires an open Checkout Session. Returns false if Stripe refuses (e.g. the session is already complete).</summary>
    public async Task<bool> TryExpireAsync(string sessionId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_stripe.SecretKey) || !sessionId.StartsWith("cs_", StringComparison.Ordinal)) return true;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.stripe.com/v1/checkout/sessions/{Uri.EscapeDataString(sessionId)}/expire");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _stripe.SecretKey);
        using var response = await http.SendAsync(request, ct);
        if (response.IsSuccessStatusCode) return true;
        var body = await response.Content.ReadAsStringAsync(ct);
        logger.LogWarning("Could not expire Stripe session {Id}: {Status} {Body}", sessionId, (int)response.StatusCode, body);
        return false;
    }

    private static string ToCents(decimal amount) =>
        ((long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero)).ToString(CultureInfo.InvariantCulture);

    /// <summary>
    /// Verifies the Stripe-Signature header (https://docs.stripe.com/webhooks#verify-manually).
    /// Returns false if the signature is missing, wrong or older than 5 minutes.
    /// </summary>
    public static bool VerifySignature(string payload, string? header, string secret, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(header) || string.IsNullOrEmpty(secret)) return false;
        string? timestamp = null;
        var signatures = new List<string>();
        foreach (var part in header.Split(','))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2) continue;
            if (kv[0] == "t") timestamp = kv[1];
            else if (kv[0] == "v1") signatures.Add(kv[1]);
        }

        if (timestamp is null || signatures.Count == 0 || !long.TryParse(timestamp, out var t)) return false;
        if (Math.Abs(now.ToUnixTimeSeconds() - t) > 300) return false;

        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{payload}"));
        foreach (var sig in signatures)
        {
            try
            {
                if (CryptographicOperations.FixedTimeEquals(expected, Convert.FromHexString(sig))) return true;
            }
            catch (FormatException)
            {
                // ignore malformed signature
            }
        }

        return false;
    }
}
