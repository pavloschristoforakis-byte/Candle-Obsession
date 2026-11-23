namespace Candle_Obsession.Models
{
    public class OrderItem
    {
        public int Id { get; set; }

        // Order Relationship
        public int OrderId { get; set; }

        public Order Order { get; set; } = null!;

        // Product Details (copied at order time so later catalogue edits don't change old orders)
        public string ProductId { get; set; } = string.Empty;
        public string Sku { get; set; } = string.Empty;
        public string ProductName { get; set; } = string.Empty;
        public string? VariantName { get; set; }

        /// <summary>Chosen options, e.g. "Wine: Red · Candle: Apple Pie".</summary>
        public string? OptionsSummary { get; set; }

        public decimal UnitPrice { get; set; }

        public int Quantity { get; set; }

        public decimal TotalPrice { get; set; }

        public string DisplayName =>
            VariantName is null ? ProductName : $"{ProductName} ({VariantName})";
    }
}
