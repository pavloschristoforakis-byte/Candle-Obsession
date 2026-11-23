using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Candle_Obsession.Services.Checkout;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Pages
{
    [EnableRateLimiting("forms")]
    public class CheckoutModel(
        OrderCalculator calculator,
        OrderService orders,
        CheckoutService checkout,
        SiteUrls urls,
        IOptions<ShopOptions> shopOptions,
        ILogger<CheckoutModel> logger) : PageModel
    {
        public ShopOptions Shop => shopOptions.Value;

        public void OnGet()
        {
        }

        /// <summary>
        /// Called by ClientApp/src/lib/checkout.ts. Validates and prices the cart on the server, saves the
        /// order, then asks CheckoutService where the customer should go to pay.
        /// </summary>
        public async Task<IActionResult> OnPostPlaceOrderAsync([FromBody] CheckoutRequest? request, CancellationToken ct)
        {
            if (request is null || !ModelState.IsValid)
            {
                var first = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));
                return BadRequest(new { message = first ?? "Please check your details and try again." });
            }

            var (quote, error) = calculator.Calculate(request);
            if (quote is null) return BadRequest(new { message = error });

            // Same checkout attempt submitted twice (double click, retry after a lost response): no second order.
            if (await orders.FindByIdempotencyKeyAsync(request.IdempotencyKey, ct) is { } existing)
                return Duplicate(existing);

            Order order;
            try
            {
                order = await orders.CreateAsync(request, quote, ct);
            }
            catch (DbUpdateException) when (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
            {
                // Two identical submits raced past the check above; the unique index kept only one.
                if (await orders.FindByIdempotencyKeyAsync(request.IdempotencyKey, ct) is { } raced) return Duplicate(raced);
                throw;
            }
            logger.LogInformation("Order {OrderId} ({PublicId}) placed: {Total} via {Payment}", order.Id, order.PublicId, order.Total, order.PaymentMethod);

            var successUrl = urls.Absolute(HttpContext, $"/order/success/{order.PublicId}");
            var cancelUrl = urls.Absolute(HttpContext, $"/order/cancelled/{order.PublicId}");

            var redirect = successUrl;
            if (order.PaymentMethod == "card")
            {
                var start = await checkout.StartPaymentAsync(new PaymentContext(order, successUrl, cancelUrl), ct);
                await orders.SetPaymentReferenceAsync(order, start.Provider, start.PaymentReference, ct);
                redirect = start.RedirectUrl;
            }

            await orders.NotifyNewOrderAsync(order, ct);

            return new JsonResult(new
            {
                success = true,
                reference = order.PublicId,
                total = order.Total,
                redirectUrl = redirect,
            });
        }

        private JsonResult Duplicate(Order existing)
        {
            logger.LogInformation("Repeated checkout submit for order {OrderId} ({PublicId}); no new order created", existing.Id, existing.PublicId);
            return new JsonResult(new
            {
                success = true,
                reference = existing.PublicId,
                total = existing.Total,
                redirectUrl = $"/order/success/{existing.PublicId}",
            });
        }
    }
}
