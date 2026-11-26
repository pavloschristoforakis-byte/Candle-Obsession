using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ImageMagick;

namespace Candle_Obsession.Services;

/// <summary>Where the catalogue file and uploaded product photos live. See HOSTING.md ("Product editor storage").</summary>
public sealed class CatalogOptions
{
    public const string SectionName = "Catalog";

    /// <summary>The catalogue file the site reads and the admin editor writes. Created from Data/products.json if missing.</summary>
    public string Path { get; set; } = "Data/products.json";

    /// <summary>Folder for photos uploaded in the admin editor. Served at /images/products/.</summary>
    public string ImagesPath { get; set; } = "wwwroot/images/products";
}

/// <summary>Part of a photo to keep, as fractions (0–1) of its width and height.</summary>
public sealed record CropRect(double X, double Y, double Width, double Height);

public sealed record StoredImage(string File, bool CanDelete, DateTime ModifiedUtc);

public sealed record ImageSaveResult(string? File, string? Error, string? Warning = null);

/// <summary>
/// Product photo library for the admin editor. An upload is decoded, turned upright, cropped to the
/// shop's 4:5 portrait shape and saved as the same set of files the site already uses:
/// {name}-400.webp, -800.webp, -1200.webp and {name}-og.jpg (for link previews).
/// Re-encoding also removes camera data such as GPS location from the photo.
/// </summary>
public sealed partial class ProductImageStore
{
    public const long MaxUploadBytes = 20 * 1024 * 1024;
    private const long MaxPixels = 80_000_000;
    private static readonly uint[] Widths = [400, 800, 1200];
    private static readonly SemaphoreSlim OneAtATime = new(1, 1);

    private readonly string _builtInDir;
    private readonly string _uploadDir;
    private readonly ILogger<ProductImageStore> _logger;

    static ProductImageStore()
    {
        // Keep one big phone photo from using all the memory of a small server.
        ResourceLimits.Width = 12000;
        ResourceLimits.Height = 12000;
        ResourceLimits.Memory = 384UL * 1024 * 1024;
        ResourceLimits.Thread = 2;
    }

    public ProductImageStore(string builtInDir, string uploadDir, ILogger<ProductImageStore> logger)
    {
        _builtInDir = System.IO.Path.GetFullPath(builtInDir);
        _uploadDir = System.IO.Path.GetFullPath(uploadDir);
        _logger = logger;
        Directory.CreateDirectory(_uploadDir);
    }

    /// <summary>The upload folder, when it is not the site's own wwwroot/images/products (then it needs its own file server).</summary>
    public string? SeparateUploadDirectory =>
        string.Equals(_builtInDir, _uploadDir, StringComparison.OrdinalIgnoreCase) ? null : _uploadDir;

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,79}$")]
    private static partial Regex FileNameRegex();

    public static bool IsValidName(string? file) => file is not null && FileNameRegex().IsMatch(file);

    public bool Exists(string? file) =>
        IsValidName(file) && (File.Exists(PathFor(_uploadDir, file!, 800)) || File.Exists(PathFor(_builtInDir, file!, 800)));

    /// <summary>Every photo that can be picked for a product, newest first.</summary>
    public IReadOnlyList<StoredImage> List()
    {
        var found = new Dictionary<string, StoredImage>(StringComparer.Ordinal);
        foreach (var (dir, uploaded) in new[] { (_uploadDir, true), (_builtInDir, false) })
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var path in Directory.EnumerateFiles(dir, "*-800.webp"))
            {
                var name = System.IO.Path.GetFileName(path)[..^"-800.webp".Length];
                if (IsValidName(name)) found.TryAdd(name, new StoredImage(name, uploaded, File.GetLastWriteTimeUtc(path)));
            }
        }

        return found.Values.OrderByDescending(i => i.ModifiedUtc).ThenBy(i => i.File, StringComparer.Ordinal).ToList();
    }

    /// <summary>Removes an uploaded photo's files. The caller checks first that no product uses it.</summary>
    public bool Delete(string file)
    {
        if (!IsValidName(file)) return false;
        var deleted = false;
        foreach (var path in AllPaths(_uploadDir, file))
        {
            if (!File.Exists(path)) continue;
            File.Delete(path);
            deleted = true;
        }

        return deleted;
    }

    public async Task<ImageSaveResult> SaveAsync(Stream upload, string? nameHint, CropRect? crop, CancellationToken ct)
    {
        byte[] bytes;
        using (var buffer = new MemoryStream())
        {
            await upload.CopyToAsync(buffer, ct);
            if (buffer.Length == 0) return new(null, "That file is empty.");
            if (buffer.Length > MaxUploadBytes) return new(null, "That photo is larger than 20 MB. Please choose a smaller one.");
            bytes = buffer.ToArray();
        }

        // Only decode formats we expect from a camera or phone; the decoder is chosen from the file's first bytes, never its name.
        if (Sniff(bytes) is not { } format)
            return new(null, "That file isn't a photo we can read. Please upload a JPG, PNG, WebP or HEIC image.");

        var name = UniqueName(nameHint);
        await OneAtATime.WaitAsync(ct);
        try
        {
            return await Task.Run(() => Process(bytes, format, name, crop), ct);
        }
        catch (MagickException ex)
        {
            _logger.LogWarning(ex, "Could not process uploaded image {Name}", name);
            foreach (var path in AllPaths(_uploadDir, name)) File.Delete(path);
            return new(null, "We couldn't read that photo. Try saving it as a JPG and uploading it again.");
        }
        finally
        {
            OneAtATime.Release();
        }
    }

    private ImageSaveResult Process(byte[] bytes, MagickFormat format, string name, CropRect? crop)
    {
        var settings = new MagickReadSettings { Format = format };
        var info = new MagickImageInfo(bytes, settings);
        if ((long)info.Width * info.Height > MaxPixels)
            return new(null, "That photo has too many pixels for the server. Please upload one under 80 megapixels.");

        using var image = new MagickImage(bytes, settings);
        image.AutoOrient();
        // Phone photos are often in a wide colour space; convert to the web standard before the colour profile is removed.
        if (image.GetColorProfile() is not null) image.TransformColorSpace(ColorProfiles.SRGB);
        image.Strip(); // removes camera data (EXIF, GPS location) and profiles
        image.ColorSpace = ColorSpace.sRGB;

        var (x, y, w, h) = PortraitCrop(image.Width, image.Height, crop);
        string? warning = w < 800 ? "This photo is quite small, so it may look soft on large screens." : null;

        using (var portrait = image.Clone())
        {
            portrait.Crop(new MagickGeometry((int)x, (int)y, w, h));
            portrait.ResetPage();
            foreach (var width in Widths)
            {
                using var sized = portrait.Clone();
                sized.Resize(new MagickGeometry(width, width * 5 / 4) { IgnoreAspectRatio = true });
                sized.Quality = 80;
                sized.Write(PathFor(_uploadDir, name, (int)width), MagickFormat.WebP);
            }
        }

        // Link-preview image (1200×630), centred on the same part of the photo.
        using (var wide = image.Clone())
        {
            var ogW = Math.Min(image.Width, (uint)(image.Height * 1200.0 / 630.0));
            var ogH = Math.Min(image.Height, (uint)(ogW * 630.0 / 1200.0));
            var ogX = Math.Clamp(x + w / 2.0 - ogW / 2.0, 0, image.Width - ogW);
            var ogY = Math.Clamp(y + h / 2.0 - ogH / 2.0, 0, image.Height - ogH);
            wide.Crop(new MagickGeometry((int)ogX, (int)ogY, ogW, ogH));
            wide.ResetPage();
            wide.Resize(new MagickGeometry(1200, 630) { IgnoreAspectRatio = true });
            wide.ColorAlpha(MagickColors.White); // JPEG has no transparency: put see-through areas on white
            wide.Quality = 82;
            wide.Write(OgPath(_uploadDir, name), MagickFormat.Jpeg);
        }

        _logger.LogInformation("Saved product image {Name} ({Width}x{Height} source)", name, image.Width, image.Height);
        return new(name, null, warning);
    }

    /// <summary>The 4:5 portrait area to keep, in pixels: the admin's crop if given, otherwise the largest centred one.</summary>
    internal static (uint X, uint Y, uint Width, uint Height) PortraitCrop(uint imageWidth, uint imageHeight, CropRect? crop)
    {
        double maxW = Math.Min(imageWidth, imageHeight * 4.0 / 5.0);
        double w = maxW, cx = imageWidth / 2.0, cy = imageHeight / 2.0;
        if (crop is not null && IsUsable(crop))
        {
            w = Math.Clamp(crop.Width * imageWidth, Math.Min(maxW, 50), maxW);
            cx = (crop.X + crop.Width / 2) * imageWidth;
            cy = (crop.Y + crop.Height / 2) * imageHeight;
        }

        var h = w * 5.0 / 4.0;
        var x = Math.Clamp(cx - w / 2, 0, imageWidth - w);
        var y = Math.Clamp(cy - h / 2, 0, imageHeight - h);
        return ((uint)Math.Round(x), (uint)Math.Round(y), Math.Max(1, (uint)Math.Floor(w)), Math.Max(1, (uint)Math.Floor(h)));
    }

    private static bool IsUsable(CropRect c) =>
        double.IsFinite(c.X) && double.IsFinite(c.Y) && double.IsFinite(c.Width) && double.IsFinite(c.Height)
        && c.Width is > 0 and <= 1 && c.Height is > 0 and <= 1 && c.X is >= 0 and <= 1 && c.Y is >= 0 and <= 1;

    private static MagickFormat? Sniff(ReadOnlySpan<byte> b)
    {
        if (b.Length < 16) return null;
        if (b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return MagickFormat.Jpeg;
        if (b[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return MagickFormat.Png;
        if (b[..4].SequenceEqual("RIFF"u8) && b.Slice(8, 4).SequenceEqual("WEBP"u8)) return MagickFormat.WebP;
        if (b.Slice(4, 4).SequenceEqual("ftyp"u8))
        {
            var brand = Encoding.ASCII.GetString(b.Slice(8, 4));
            if (brand is "heic" or "heix" or "hevc" or "hevx" or "heim" or "heis" or "mif1" or "msf1") return MagickFormat.Heic;
            if (brand is "avif" or "avis") return MagickFormat.Avif;
        }

        return null;
    }

    private string UniqueName(string? hint)
    {
        var slug = Regex.Replace((hint ?? string.Empty).ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        if (slug.Length > 48) slug = slug[..48].Trim('-');
        if (slug.Length == 0) slug = "photo";
        while (true)
        {
            var name = $"{slug}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(3)).ToLowerInvariant()}";
            if (!Exists(name)) return name;
        }
    }

    private static string PathFor(string dir, string file, int width) => System.IO.Path.Combine(dir, $"{file}-{width}.webp");
    private static string OgPath(string dir, string file) => System.IO.Path.Combine(dir, $"{file}-og.jpg");

    private static IEnumerable<string> AllPaths(string dir, string file) =>
        Widths.Select(w => PathFor(dir, file, (int)w)).Append(OgPath(dir, file));
}
