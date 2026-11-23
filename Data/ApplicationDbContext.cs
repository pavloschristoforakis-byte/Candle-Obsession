using Microsoft.EntityFrameworkCore;
using Candle_Obsession.Models;

namespace Candle_Obsession.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(
            DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Order> Orders { get; set; }

        public DbSet<OrderItem> OrderItems { get; set; }

        public DbSet<WithdrawalRequest> WithdrawalRequests { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Order>(order =>
            {
                order.HasIndex(o => o.PublicId).IsUnique();
                order.HasIndex(o => o.IdempotencyKey).IsUnique().HasFilter("\"IdempotencyKey\" IS NOT NULL");
                order.HasIndex(o => o.OrderDate);
                order.Property(o => o.Subtotal).HasPrecision(10, 2);
                order.Property(o => o.ShippingCost).HasPrecision(10, 2);
                order.Property(o => o.GiftWrapCost).HasPrecision(10, 2);
                order.Property(o => o.Total).HasPrecision(10, 2);
            });

            modelBuilder.Entity<OrderItem>(item =>
            {
                item.Property(i => i.UnitPrice).HasPrecision(10, 2);
                item.Property(i => i.TotalPrice).HasPrecision(10, 2);
            });
        }
    }
}
