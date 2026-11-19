
namespace Candle_Obsession.Data
{
    public static class ProductCatalog
    {
        private static readonly Dictionary<string, decimal> Products = new()
        {
            { "Macademia Vanilla", 13.00m },
            { "Baby Powder", 15.00m },
            { "Apple Pie", 12.00m },
            { "Strawbery", 15.00m }
        };

        public static bool TryGetPrice(string productName, out decimal price)
        {
            return Products.TryGetValue(productName, out price);
        }
    }
}
