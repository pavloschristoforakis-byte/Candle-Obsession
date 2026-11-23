using System.ComponentModel.DataAnnotations;

namespace Candle_Obsession.Models;

/// <summary>
/// A customer's "withdraw from contract" request (EU right of withdrawal, Art. 11a Directive 2011/83/EU
/// as amended by Directive (EU) 2023/2673). Submitted at /withdraw.
/// </summary>
public class WithdrawalRequest
{
    public int Id { get; set; }

    [MaxLength(32)]
    public string? OrderReference { get; set; }

    /// <summary>Linked order if the reference + email matched one.</summary>
    public int? OrderId { get; set; }

    [MaxLength(160)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Details { get; set; }

    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;

    public bool Handled { get; set; }
}
