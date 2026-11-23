using Candle_Obsession.Data;
using Candle_Obsession.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace Candle_Obsession.Pages.Admin;

/// <summary>Owner dashboard: latest orders and withdrawal requests. Protected by Admin:Password.</summary>
public class IndexModel(ApplicationDbContext db) : PageModel
{
    public List<Models.Order> Orders { get; private set; } = [];
    public List<WithdrawalRequest> Withdrawals { get; private set; } = [];
    public Models.Order? Selected { get; private set; }

    public async Task OnGetAsync(int? id, CancellationToken ct)
    {
        Orders = await db.Orders.Include(o => o.OrderItems).OrderByDescending(o => o.Id).Take(200).ToListAsync(ct);
        Withdrawals = await db.WithdrawalRequests.OrderByDescending(w => w.Id).Take(50).ToListAsync(ct);
        Selected = id is null ? null : Orders.FirstOrDefault(o => o.Id == id)
                   ?? await db.Orders.Include(o => o.OrderItems).FirstOrDefaultAsync(o => o.Id == id, ct);
    }

    public async Task<IActionResult> OnPostStatusAsync(int id, string orderStatus, string paymentStatus, CancellationToken ct)
    {
        var order = await db.Orders.FindAsync([id], ct);
        if (order is null) return NotFound();
        if (OrderStatuses.All.Contains(orderStatus)) order.OrderStatus = orderStatus;
        if (PaymentStatuses.All.Contains(paymentStatus))
        {
            if (paymentStatus == PaymentStatuses.Paid && order.PaymentStatus != PaymentStatuses.Paid) order.PaidAtUtc = DateTime.UtcNow;
            order.PaymentStatus = paymentStatus;
        }

        await db.SaveChangesAsync(ct);
        return RedirectToPage(new { id });
    }

    public async Task<IActionResult> OnPostWithdrawalHandledAsync(int id, CancellationToken ct)
    {
        var w = await db.WithdrawalRequests.FindAsync([id], ct);
        if (w is not null)
        {
            w.Handled = true;
            await db.SaveChangesAsync(ct);
        }

        return RedirectToPage();
    }
}
