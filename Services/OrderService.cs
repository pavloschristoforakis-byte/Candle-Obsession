using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Candle_Obsession.Data;
using Candle_Obsession.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Services;

public static class Money
{
    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("en-IE");

    /// <summary>Formats a EUR amount like "€13.00".</summary>
    public static string Eur(decimal amount) => amount.ToString("C2", Culture);
}

/// <summary>Creates orders, records payments and sends notification emails.</summary>
public sealed class OrderService(
    ApplicationDbContext db,
    OrderNotifier notifier,
    ILogger<OrderService> logger)
{
    public static string NewPublicId()
    {
        // 16 random bytes → 22 URL-safe characters. Unguessable, so it's safe in thank-you page URLs.
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public async Task<Order> CreateAsync(CheckoutRequest request, OrderCalculator.Quote quote, CancellationToken ct)
    {
        string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        var requires = quote.Delivery.Requires;

        var order = new Order
        {
            PublicId = NewPublicId(),
            IdempotencyKey = string.IsNullOrWhiteSpace(request.IdempotencyKey) ? null : request.IdempotencyKey.Trim(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = request.Email.Trim(),
            Phone = request.Phone.Trim(),
            DeliveryMethod = quote.Delivery.Id,
            Address = requires == "address" ? Clean(request.Address) : null,
            City = requires == "address" ? Clean(request.City) : null,
            PostalCode = requires == "address" ? Clean(request.PostalCode) : null,
            Country = requires == "address" ? Clean(request.Country) ?? "Cyprus" : "Cyprus",
            Locker = requires == "locker" ? Clean(request.Locker) : null,
            GiftWrap = request.GiftWrap,
            GiftMessage = Clean(request.GiftMessage),
            AgeConfirmed = quote.ContainsAlcohol && request.AgeConfirmed,
            PaymentMethod = quote.Payment.Id,
            PaymentStatus = quote.Payment.Id == "cash" ? PaymentStatuses.PayOnDelivery : PaymentStatuses.AwaitingPayment,
            Subtotal = quote.Subtotal,
            ShippingCost = quote.Shipping,
            GiftWrapCost = quote.GiftWrapCost,
            Total = quote.Total,
            Notes = Clean(request.Notes),
            OrderStatus = OrderStatuses.New,
            OrderDate = DateTime.UtcNow,
            OrderItems = quote.Lines.Select(l => new OrderItem
            {
                ProductId = l.Product.Id,
                Sku = l.Variant?.Sku ?? l.Product.Sku,
                ProductName = l.Product.Name,
                VariantName = l.Variant?.Name,
                OptionsSummary = l.OptionsSummary,
                UnitPrice = l.UnitPrice,
                Quantity = l.Quantity,
                TotalPrice = l.Total,
            }).ToList(),
        };

        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return order;
    }

    public Task<Order?> FindAsync(string? publicId, CancellationToken ct = default) =>
        string.IsNullOrWhiteSpace(publicId)
            ? Task.FromResult<Order?>(null)
            : db.Orders.Include(o => o.OrderItems).FirstOrDefaultAsync(o => o.PublicId == publicId, ct);

    /// <summary>The order already created by an earlier submit of the same checkout attempt, if any.</summary>
    public Task<Order?> FindByIdempotencyKeyAsync(string? key, CancellationToken ct = default) =>
        string.IsNullOrWhiteSpace(key)
            ? Task.FromResult<Order?>(null)
            : db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.IdempotencyKey == key.Trim(), ct);

    public async Task SetPaymentReferenceAsync(Order order, string provider, string? reference, CancellationToken ct)
    {
        order.PaymentProvider = provider;
        if (reference is not null) order.PaymentReference = reference;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Called by payment webhooks. Safe to call more than once.</summary>
    public async Task<bool> MarkPaidAsync(string publicId, string provider, string? reference, CancellationToken ct = default)
    {
        var order = await FindAsync(publicId, ct);
        if (order is null)
        {
            logger.LogWarning("Payment for unknown order {PublicId} from {Provider}", publicId, provider);
            return false;
        }

        if (order.PaymentStatus == PaymentStatuses.Paid)
        {
            // Webhook retries for the same session match the stored reference and stay silent.
            if (reference is not null && order.PaymentReference is not null && reference != order.PaymentReference)
            {
                logger.LogWarning("Second payment {Reference} for already-paid order {PublicId} (first: {First})", reference, publicId, order.PaymentReference);
                await notifier.SendAsync($"Possible double payment: order {order.Id}",
                    $"Order {order.Id} ({order.PublicId}) was already paid ({order.PaymentReference}) and a second payment {reference} arrived via {provider}. Check the payment dashboard and refund one.", ct);
            }
            return true;
        }
        order.PaymentStatus = PaymentStatuses.Paid;
        order.PaymentProvider = provider;
        order.PaymentReference = reference ?? order.PaymentReference;
        order.PaidAtUtc = DateTime.UtcNow;
        if (order.OrderStatus == OrderStatuses.New) order.OrderStatus = OrderStatuses.Confirmed;
        await db.SaveChangesAsync(ct);
        await notifier.SendAsync($"Payment received: order {order.Id}", $"Order {order.Id} ({order.PublicId}) was paid via {provider}. Total {Money.Eur(order.Total)}.", ct);
        return true;
    }

    /// <summary>A payment arrived that doesn't match the order (amount, currency or session). The owner checks it by hand.</summary>
    public Task NotifyPaymentMismatchAsync(Order order, string details, CancellationToken ct = default) =>
        notifier.SendAsync($"Check payment: order {order.Id}",
            $"A payment for order {order.Id} ({order.PublicId}, total {Money.Eur(order.Total)}) did not match the order and was NOT marked as paid. {details} Check the payment dashboard.", ct);

    public Task NotifyNewOrderAsync(Order order, CancellationToken ct) =>
        notifier.SendAsync($"New order {order.Id}: {Money.Eur(order.Total)} ({order.CustomerName})", OrderNotifier.Describe(order), ct);
}

public sealed class SmtpOptions
{
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string? From { get; set; }
}

/// <summary>
/// Emails the owner about new orders. Configure Smtp:* and Shop:OrderNotificationEmail.
/// If not configured, it only writes to the log; orders are always in the database and /admin.
/// </summary>
public sealed class OrderNotifier(IOptions<SmtpOptions> smtp, IOptions<ShopOptions> shop, ILogger<OrderNotifier> logger)
{
    /// <summary>Sends to the owner (Shop:OrderNotificationEmail).</summary>
    public Task SendAsync(string subject, string body, CancellationToken ct) =>
        SendToAsync(shop.Value.OrderNotificationEmail, subject, body, ct);

    /// <summary>True when emails can actually be sent.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(smtp.Value.Host) && !string.IsNullOrWhiteSpace(smtp.Value.From);

    public async Task SendToAsync(string? to, string subject, string body, CancellationToken ct)
    {
        // MailMessage refuses line breaks in a subject (e.g. from a customer's name) and would drop the email.
        subject = string.Join(' ', subject.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        var s = smtp.Value;
        if (string.IsNullOrWhiteSpace(to) || string.IsNullOrWhiteSpace(s.Host) || string.IsNullOrWhiteSpace(s.From))
        {
            logger.LogInformation("Email not configured. Would send '{Subject}'.", subject);
            return;
        }

        try
        {
            using var client = new SmtpClient(s.Host, s.Port) { EnableSsl = s.EnableSsl, Timeout = 10_000 };
            if (!string.IsNullOrWhiteSpace(s.User)) client.Credentials = new NetworkCredential(s.User, s.Password);
            using var message = new MailMessage(s.From, to, subject, body);
            await client.SendMailAsync(message, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Never fail an order because email is down.
            logger.LogError(ex, "Could not send email '{Subject}'", subject);
        }
    }

    public static string Describe(Order order)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Order {order.Id}  (ref {order.PublicId})  {order.OrderDate:yyyy-MM-dd HH:mm} UTC");
        sb.AppendLine($"{order.CustomerName}  {order.Email}  {order.Phone}");
        sb.AppendLine($"Delivery: {order.DeliveryMethod}  {order.Address} {order.City} {order.PostalCode} {order.Country} {order.Locker}".TrimEnd());
        sb.AppendLine($"Payment: {order.PaymentMethod} ({order.PaymentStatus})");
        sb.AppendLine();
        foreach (var item in order.OrderItems)
        {
            sb.AppendLine($"  {item.Quantity} × {item.DisplayName}  {Money.Eur(item.TotalPrice)}");
            if (item.OptionsSummary is not null) sb.AppendLine($"      {item.OptionsSummary}");
        }

        sb.AppendLine();
        sb.AppendLine($"Subtotal {Money.Eur(order.Subtotal)} · Delivery {Money.Eur(order.ShippingCost)} · Gift wrap {Money.Eur(order.GiftWrapCost)}");
        sb.AppendLine($"TOTAL {Money.Eur(order.Total)}");
        if (order.GiftWrap) sb.AppendLine("Gift wrap: yes");
        if (order.GiftMessage is not null) sb.AppendLine($"Gift message: {order.GiftMessage}");
        if (order.Notes is not null) sb.AppendLine($"Notes: {order.Notes}");
        return sb.ToString();
    }
}
