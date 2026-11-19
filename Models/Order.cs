
namespace Candle_Obsession.Models
{
    public class Order
    {
        public int Id { get; set; }

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

        // Payment Details
        public string PaymentMethod { get; set; } = string.Empty;
        public string PaymentStatus { get; set; } = "Pending";

        // Order Prices
        public decimal Subtotal { get; set; }
        public decimal ShippingCost { get; set; }
        public decimal Total { get; set; }

        // Additional Information
        public string? Notes { get; set; }
        public string OrderStatus { get; set; } = "Pending";
        public DateTime OrderDate { get; set; } = DateTime.UtcNow;
        // Products included in the order
        public List<OrderItem> OrderItems { get; set; } = new();
    }
}
