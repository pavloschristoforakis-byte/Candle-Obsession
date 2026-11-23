using System.ComponentModel.DataAnnotations;

namespace Candle_Obsession.Models
{
    public class Order
    {
        public int Id { get; set; }

        /// <summary>Random, unguessable reference used in URLs and sent to the payment provider.</summary>
        [MaxLength(32)]
        public string PublicId { get; set; } = string.Empty;

        /// <summary>Checkout attempt id from the browser. A repeated submit with the same id returns this order.</summary>
        [MaxLength(64)]
        public string? IdempotencyKey { get; set; }

        // Customer Details
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;

        // Delivery Details
        public string DeliveryMethod { get; set; } = string.Empty;
        public string? Address { get; set; }
        public string? City { get; set; }
        public string? PostalCode { get; set; }
        public string Country { get; set; } = "Cyprus";
        public string? Locker { get; set; }

        // Gift options
        public bool GiftWrap { get; set; }
        public string? GiftMessage { get; set; }

        /// <summary>Customer confirmed they meet the minimum age (orders containing wine).</summary>
        public bool AgeConfirmed { get; set; }

        // Payment Details
        public string PaymentMethod { get; set; } = string.Empty;
        public string PaymentStatus { get; set; } = PaymentStatuses.Pending;

        /// <summary>Checkout provider used for online payment (Manual, PaymentLinks, StripeCheckout…).</summary>
        public string? PaymentProvider { get; set; }

        /// <summary>Provider's id for the payment/session (e.g. Stripe Checkout Session id).</summary>
        public string? PaymentReference { get; set; }

        public DateTime? PaidAtUtc { get; set; }

        // Order Prices
        public decimal Subtotal { get; set; }
        public decimal ShippingCost { get; set; }
        public decimal GiftWrapCost { get; set; }
        public decimal Total { get; set; }

        // Additional Information
        public string? Notes { get; set; }
        public string OrderStatus { get; set; } = OrderStatuses.New;
        public DateTime OrderDate { get; set; } = DateTime.UtcNow;

        // Products included in the order
        public List<OrderItem> OrderItems { get; set; } = new();

        public string CustomerName => $"{FirstName} {LastName}".Trim();
    }

    public static class PaymentStatuses
    {
        public const string Pending = "Pending";
        /// <summary>Waiting for the customer to pay online / by Revolut.</summary>
        public const string AwaitingPayment = "AwaitingPayment";
        /// <summary>Cash on delivery or pickup.</summary>
        public const string PayOnDelivery = "PayOnDelivery";
        public const string Paid = "Paid";
        public const string Refunded = "Refunded";
        public const string Cancelled = "Cancelled";

        public static readonly string[] All = { Pending, AwaitingPayment, PayOnDelivery, Paid, Refunded, Cancelled };
    }

    public static class OrderStatuses
    {
        public const string New = "New";
        public const string Confirmed = "Confirmed";
        public const string Shipped = "Shipped";
        public const string Completed = "Completed";
        public const string Cancelled = "Cancelled";

        public static readonly string[] All = { New, Confirmed, Shipped, Completed, Cancelled };
    }
}
