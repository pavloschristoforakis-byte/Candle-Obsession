
namespace Candle_Obsession.Models
{
    public class OrderItem
    {
        public int Id { get; set; }

        // Order Relationship
        public int OrderId { get; set; }

        public Order Order { get; set; } = null!;

        // Product Details
        public string ProductName { get; set; } = string.Empty;

        public decimal UnitPrice { get; set; }

        public int Quantity { get; set; }

        public decimal TotalPrice { get; set; }
    }
}
