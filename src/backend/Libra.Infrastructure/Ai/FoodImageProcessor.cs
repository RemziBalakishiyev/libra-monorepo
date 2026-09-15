using Libra.Application.Nutrition.FoodAnalysis;
using Microsoft.Extensions.Options;
using SkiaSharp;

namespace Libra.Infrastructure.Ai;

/// <summary>
/// Validates and normalizes an uploaded photo before it goes anywhere.
///
/// The bytes are decoded, so a renamed file or a mislabelled content type is caught by what the file actually is;
/// the EXIF orientation is baked into the pixels; the picture is scaled down to the configured longest edge; and
/// the result is re-encoded as JPEG from raw pixels, which leaves every metadata block behind — no GPS
/// coordinates or device identifiers reach the provider or the store.
/// </summary>
public sealed class FoodImageProcessor(IOptions<FoodAnalysisOptions> options) : IFoodImageProcessor
{
    private static readonly SKEncodedImageFormat[] SupportedFormats = [SKEncodedImageFormat.Jpeg, SKEncodedImageFormat.Png, SKEncodedImageFormat.Webp];

    private readonly FoodAnalysisOptions _options = options.Value;

    public ImageProcessingResult Process(byte[] bytes)
    {
        if (bytes is null || bytes.Length == 0)
        {
            return ImageProcessingResult.Rejected(ImageRejection.Empty);
        }

        if (bytes.Length > _options.MaxUploadBytes)
        {
            return ImageProcessingResult.Rejected(ImageRejection.TooLarge);
        }

        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        if (codec is null)
        {
            return ImageProcessingResult.Rejected(ImageRejection.Unreadable);
        }

        if (!SupportedFormats.Contains(codec.EncodedFormat))
        {
            return ImageProcessingResult.Rejected(ImageRejection.UnsupportedType);
        }

        // The header is read before any pixels are decoded, so a decompression bomb is rejected up front.
        var info = codec.Info;
        if ((long)info.Width * info.Height > _options.MaxImagePixels)
        {
            return ImageProcessingResult.Rejected(ImageRejection.TooManyPixels);
        }

        using var decoded = SKBitmap.Decode(codec);
        if (decoded is null)
        {
            return ImageProcessingResult.Rejected(ImageRejection.Unreadable);
        }

        using var upright = ApplyOrientation(decoded, codec.EncodedOrigin);
        if (upright.Width < _options.MinImageDimension || upright.Height < _options.MinImageDimension)
        {
            return ImageProcessingResult.Rejected(ImageRejection.TooSmall);
        }

        using var bounded = Resize(upright, _options.MaxStoredDimension);
        using var image = SKImage.FromBitmap(bounded);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, _options.JpegQuality);
        if (encoded is null)
        {
            return ImageProcessingResult.Rejected(ImageRejection.Unreadable);
        }

        return ImageProcessingResult.Ok(new ProcessedImage(encoded.ToArray(), "image/jpeg", bounded.Width, bounded.Height));
    }

    /// <summary>Scales the longest edge down to <paramref name="maxDimension"/>. Smaller pictures are never upscaled.</summary>
    private static SKBitmap Resize(SKBitmap source, int maxDimension)
    {
        var longest = Math.Max(source.Width, source.Height);
        if (longest <= maxDimension)
        {
            return source.Copy();
        }

        var scale = (double)maxDimension / longest;
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        var resized = new SKBitmap(new SKImageInfo(width, height, source.ColorType, source.AlphaType));
        source.ScalePixels(resized, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        return resized;
    }

    /// <summary>Bakes the encoded EXIF origin into the pixels, so the stored picture needs no orientation tag.</summary>
    private static SKBitmap ApplyOrientation(SKBitmap source, SKEncodedOrigin origin)
    {
        if (origin is SKEncodedOrigin.Default or SKEncodedOrigin.TopLeft)
        {
            return source.Copy();
        }

        var swapsAxes = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var width = swapsAxes ? source.Height : source.Width;
        var height = swapsAxes ? source.Width : source.Height;
        var rotated = new SKBitmap(new SKImageInfo(width, height, source.ColorType, source.AlphaType));

        using var canvas = new SKCanvas(rotated);
        switch (origin)
        {
            case SKEncodedOrigin.TopRight:
                canvas.Scale(-1, 1, width / 2f, 0);
                break;
            case SKEncodedOrigin.BottomRight:
                canvas.RotateDegrees(180, width / 2f, height / 2f);
                break;
            case SKEncodedOrigin.BottomLeft:
                canvas.Scale(1, -1, 0, height / 2f);
                break;
            case SKEncodedOrigin.LeftTop:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                canvas.Scale(-1, 1, source.Width / 2f, 0);
                canvas.Translate(-width, 0);
                canvas.Translate(width, 0);
                break;
            case SKEncodedOrigin.RightTop:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                break;
            case SKEncodedOrigin.RightBottom:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                canvas.Scale(1, -1, 0, source.Height / 2f);
                break;
            case SKEncodedOrigin.LeftBottom:
                canvas.Translate(0, height);
                canvas.RotateDegrees(270);
                break;
        }

        canvas.DrawBitmap(source, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.None));
        canvas.Flush();
        return rotated;
    }
}
