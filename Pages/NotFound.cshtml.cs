using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Candle_Obsession.Pages;

/// <summary>
/// Error page for 404s and other status codes (re-executed by UseStatusCodePagesWithReExecute).
/// Accepts any method, because a failed POST is re-executed as a POST, and skips antiforgery so a
/// re-executed form post doesn't turn into a blank 400.
/// </summary>
[IgnoreAntiforgeryToken]
[ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
public class NotFoundModel : PageModel
{
    public int Code { get; private set; }

    public void OnGet() => Resolve();

    public void OnPost() => Resolve();

    private void Resolve()
    {
        // When re-executed, Response.StatusCode still holds the original code (404, 400, 429…).
        if (HttpContext.Features.Get<IStatusCodeReExecuteFeature>() is null || Response.StatusCode == 200)
            Response.StatusCode = 404;
        Code = Response.StatusCode;
    }
}
