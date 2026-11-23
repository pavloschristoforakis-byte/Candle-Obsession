using System.ComponentModel.DataAnnotations;

namespace Candle_Obsession.Models
{
    /// <summary>JSON body posted by the checkout page (ClientApp/src/lib/checkout.ts).</summary>
    public class CheckoutRequest
    {
        // Single-line fields may not contain control characters (line breaks would break the order email subject).
        private const string SingleLine = @"^[^\p{C}]*$";
        private const string SingleLineMessage = "Please use letters, numbers, spaces and punctuation only.";

        // Customer Details
        [Required, MaxLength(80), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string FirstName { get; set; } = string.Empty;

        [Required, MaxLength(80), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string LastName { get; set; } = string.Empty;

        [Required, EmailAddress, MaxLength(254)]
        public string Email { get; set; } = string.Empty;

        [Required, MaxLength(30), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string Phone { get; set; } = string.Empty;

        // Delivery Details
        [Required, MaxLength(20)]
        public string DeliveryMethod { get; set; } = string.Empty;

        [MaxLength(200)]
        public string? Address { get; set; }

        [MaxLength(80), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string? City { get; set; }

        [MaxLength(20), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string? PostalCode { get; set; }

        [MaxLength(60), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string? Country { get; set; }

        [MaxLength(120), RegularExpression(SingleLine, ErrorMessage = SingleLineMessage)]
        public string? Locker { get; set; }

        // Gift options
        public bool GiftWrap { get; set; }

        [MaxLength(1000)]
        public string? GiftMessage { get; set; }

        public bool AgeConfirmed { get; set; }

        public bool AcceptTerms { get; set; }

        // Payment Details
        [Required, MaxLength(20)]
        public string PaymentMethod { get; set; } = string.Empty;

        // Additional Information
        [MaxLength(1000)]
        public string? Notes { get; set; }

        /// <summary>Random id the checkout page sends with every attempt, so a double submit creates one order.</summary>
        [MaxLength(64)]
        public string? IdempotencyKey { get; set; }

        // Shopping Cart
        [MaxLength(50)]
        public List<CartItemRequest> Items { get; set; } = new();
    }

    public class CartItemRequest
    {
        /// <summary>Product id from Data/products.json.</summary>
        [MaxLength(80)]
        public string? ProductId { get; set; }

        [MaxLength(80)]
        public string? VariantId { get; set; }

        /// <summary>Only used for carts saved by the old site (name-based).</summary>
        [MaxLength(120)]
        public string? Name { get; set; }

        [Range(1, 100)]
        public int Quantity { get; set; }

        public Dictionary<string, string>? Options { get; set; }
    }
}
