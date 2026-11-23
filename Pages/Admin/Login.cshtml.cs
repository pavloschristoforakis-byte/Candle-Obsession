using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Candle_Obsession.Pages.Admin;

/// <summary>App-wide (not per-IP) brake on wrong admin passwords, so spoofed addresses don't help guessing.</summary>
internal static class AdminLoginThrottle
{
    private static readonly object Gate = new();
    private static readonly Queue<DateTimeOffset> Failures = new();
    private const int MaxFailures = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    public static bool IsLocked()
    {
        lock (Gate)
        {
            var cutoff = DateTimeOffset.UtcNow - Window;
            while (Failures.Count > 0 && Failures.Peek() < cutoff) Failures.Dequeue();
            return Failures.Count >= MaxFailures;
        }
    }

    public static void RecordFailure()
    {
        lock (Gate) Failures.Enqueue(DateTimeOffset.UtcNow);
    }

    public static void Reset()
    {
        lock (Gate) Failures.Clear();
    }
}

[EnableRateLimiting("forms")]
public class LoginModel(IOptions<AdminOptions> admin, ILogger<LoginModel> logger) : PageModel
{
    [BindProperty] public string Password { get; set; } = string.Empty;
    public string? Error { get; private set; }
    public bool Enabled => !string.IsNullOrWhiteSpace(admin.Value.Password);

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync(string? returnUrl)
    {
        if (!Enabled) return Page();
        if (AdminLoginThrottle.IsLocked())
        {
            logger.LogWarning("Admin login locked: too many failed attempts");
            Error = "Too many attempts. Try again in 15 minutes.";
            return Page();
        }

        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(admin.Value.Password!));
        var given = SHA256.HashData(Encoding.UTF8.GetBytes(Password ?? string.Empty));
        if (!CryptographicOperations.FixedTimeEquals(expected, given))
        {
            AdminLoginThrottle.RecordFailure();
            logger.LogWarning("Failed admin login from {Ip}", HttpContext.Connection.RemoteIpAddress);
            await Task.Delay(1000);
            Error = "Wrong password.";
            return Page();
        }

        AdminLoginThrottle.Reset();
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "owner"),
            new Claim(AdminOptions.FingerprintClaim, AdminOptions.Fingerprint(admin.Value.Password)!),
        }, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        return LocalRedirect(Url.IsLocalUrl(returnUrl) ? returnUrl! : "/admin");
    }

    public async Task<IActionResult> OnPostLogoutAsync()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Redirect("/");
    }
}
