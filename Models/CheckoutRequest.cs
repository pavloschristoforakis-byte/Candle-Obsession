
using System.ComponentModel.DataAnnotations;

namespace Candle_Obsession.Models
{
    public class CheckoutRequest
    {
        // Customer Details
        [Required]
        public string FirstName { get; set; } = string.Empty;

        [Required]
        public string LastName { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string Phone { get; set; } = string.Empty;

        // Delivery Details
        [Required]
        public string DeliveryMethod { get; set; } = string.Empty;

        public string? Address { get; set; }

        public string? City { get; set; }

        public string? PostalCode { get; set; }

        public string Country { get; set; } = "Cyprus";

        public string? Locker { get; set; }

        // Payment Details
        [Required]
        public string PaymentMethod { get; set; } = string.Empty;

        // Additional Information
        public string? Notes { get; set; }

        // Shopping Cart
        public List<CartItemRequest> Items { get; set; } = new();
    }

    public class CartItemRequest
    {
        [Required]
        public string Name { get; set; } = string.Empty;

        [Range(1, 100)]
        public int Quantity { get; set; }
    }
}
