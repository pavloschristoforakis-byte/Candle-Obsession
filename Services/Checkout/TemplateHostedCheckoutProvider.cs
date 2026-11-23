namespace Candle_Obsession.Services.Checkout;

/// <summary>
/// TEMPLATE for any other cart-level provider with a hosted payment page
/// (Viva Wallet Smart Checkout, JCC, Revolut Merchant API, PayPal …). Not registered by default.
///
/// 1. Copy this file, rename the class and set Name (e.g. "VivaSmartCheckout").
/// 2. Add the provider's settings to CheckoutOptions (keys come from environment variables, never commit them).
/// 3. In StartAsync: call the provider's "create payment / order" API with
///      amount      = context.Order.Total (convert to cents if the API wants minor units),
///      currency    = EUR,
///      reference   = context.Order.PublicId  (so the webhook can find the order),
///      success URL = context.SuccessUrl, cancel URL = context.CancelUrl,
///      customer email = context.Order.Email.
///    Return new PaymentStart(&lt;hosted payment page URL&gt;, IsExternal: true, Provider: Name, PaymentReference: &lt;provider id&gt;).
/// 4. Register it in Program.cs:  builder.Services.AddHttpClient&lt;ICheckoutProvider, YourProvider&gt;();
/// 5. Add a webhook endpoint next to the Stripe one in Program.cs that verifies the provider's signature
///    and calls OrderService.MarkPaidAsync(publicId, Name, providerReference). Check the paid amount and currency
///    against the order first (see the Stripe webhook in Program.cs for an example).
/// 6. Set Checkout:Provider to your Name. See INTEGRATION.md for a worked checklist.
/// </summary>
public sealed class TemplateHostedCheckoutProvider : ICheckoutProvider
{
    public string Name => "Template";

    public Task<PaymentStart?> StartAsync(PaymentContext context, CancellationToken ct)
    {
        // TODO: call your provider here. Returning null makes CheckoutService fall back to Manual.
        return Task.FromResult<PaymentStart?>(null);
    }
}
