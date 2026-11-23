using System.ComponentModel.DataAnnotations;
using Candle_Obsession.Data;
using Candle_Obsession.Models;
using Candle_Obsession.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Candle_Obsession.Pages;

/// <summary>
/// "Withdraw from contract here" function required for online shops in the EU from 19 June 2026
/// (Art. 11a of Directive 2011/83/EU, added by Directive (EU) 2023/2673). Two steps: fill in → confirm.
/// TODO owner/lawyer: confirm wording against the Cypriot implementing law.
/// </summary>
[EnableRateLimiting("forms")]
public class WithdrawModel(ApplicationDbContext db, OrderNotifier notifier) : PageModel
{
    public sealed class InputModel
    {
        [Required, MaxLength(160), Display(Name = "Your name")]
        public string Name { get; set; } = string.Empty;

        [Required, EmailAddress, MaxLength(254), Display(Name = "Email address used for the order")]
        public string Email { get; set; } = string.Empty;

        [MaxLength(32), Display(Name = "Order reference (from your confirmation)")]
        public string? OrderReference { get; set; }

        [MaxLength(1000), Display(Name = "Which items are you withdrawing from? (leave empty for the whole order)")]
        public string? Details { get; set; }
    }

    [BindProperty] public InputModel Input { get; set; } = new();

    /// <summary>"form" → "confirm" → "done".</summary>
    public string Step { get; private set; } = "form";

    public bool EmailSent { get; private set; }

    public void OnGet(string? reference)
    {
        Input.OrderReference = reference;
    }

    public IActionResult OnPostReview()
    {
        if (!ModelState.IsValid) return Page();
        Step = "confirm";
        return Page();
    }

    public async Task<IActionResult> OnPostConfirmAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid) return Page();

        var reference = Input.OrderReference?.Trim();
        var order = string.IsNullOrEmpty(reference)
            ? null
            : await db.Orders.FirstOrDefaultAsync(o => o.PublicId == reference, ct);
        if (order is not null && !string.Equals(order.Email, Input.Email.Trim(), StringComparison.OrdinalIgnoreCase))
            order = null; // don't link to someone else's order

        // The acknowledgement goes to the address typed in the form. So this form can't be used to mail strangers:
        // a matching order always gets one; otherwise one per address per hour and at most 20 unmatched
        // acknowledgements per hour site-wide. Every request is still stored and sent to the owner.
        var email = Input.Email.Trim();
        var since = DateTime.UtcNow.AddHours(-1);
        var recentForEmail = await db.WithdrawalRequests.CountAsync(w => w.Email == email && w.SubmittedAtUtc >= since, ct);
        var recentUnmatched = await db.WithdrawalRequests.CountAsync(w => w.OrderId == null && w.SubmittedAtUtc >= since, ct);
        var sendAck = order is not null || (recentForEmail == 0 && recentUnmatched < 20);

        var request = new WithdrawalRequest
        {
            OrderReference = reference,
            OrderId = order?.Id,
            Name = Input.Name.Trim(),
            Email = Input.Email.Trim(),
            Details = string.IsNullOrWhiteSpace(Input.Details) ? null : Input.Details.Trim(),
            SubmittedAtUtc = DateTime.UtcNow,
        };
        db.WithdrawalRequests.Add(request);
        await db.SaveChangesAsync(ct);

        var summary = $"Name: {request.Name}\nEmail: {request.Email}\nOrder reference: {request.OrderReference ?? "(not given)"}" +
                      $"{(order is null ? "" : $" → order #{order.Id}")}\nItems: {request.Details ?? "whole order"}\n" +
                      $"Received: {request.SubmittedAtUtc:yyyy-MM-dd HH:mm} UTC";

        await notifier.SendAsync($"Withdrawal request #{request.Id}", summary, ct);
        // Acknowledgement of receipt on a durable medium (email) to the customer.
        if (sendAck)
        {
            var greeting = order is null ? "Hello," : $"Hello {request.Name},";
            await notifier.SendToAsync(request.Email, "We received your withdrawal request",
                $"{greeting}\n\nWe have received your request to withdraw from your contract.\n\n{summary}\n\n" +
                "We'll reply with return instructions and refund your payment within 14 days of receiving this notice " +
                "(we may wait until we receive the goods back).\n\nCandle Obsession", ct);
        }
        EmailSent = notifier.IsConfigured && sendAck;

        Step = "done";
        return Page();
    }
}
