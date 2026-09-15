using System.Text;
using Libra.Application.Nutrition.FoodAnalysis;
using Libra.Infrastructure.Ai;
using SkiaSharp;

namespace Libra.UnitTests.Nutrition;

/// <summary>
/// What arrives from a phone is untrusted: the extension, the declared content type and the header can all lie,
/// so the processor judges the bytes themselves and re-encodes what it decoded.
/// </summary>
public sealed class FoodImageProcessorTests
{
    private static readonly FoodAnalysisOptions Defaults = new();

    private static FoodImageProcessor Processor(FoodAnalysisOptions? options = null) =>
        new(Microsoft.Extensions.Options.Options.Create(options ?? Defaults));

    private static byte[] Encode(int width, int height, SKEncodedImageFormat format = SKEncodedImageFormat.Jpeg)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.Wheat);
            using var paint = new SKPaint { Color = SKColors.SaddleBrown };
            canvas.DrawRect(new SKRect(0, 0, width / 2f, height), paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }

    [Fact]
    public void An_empty_upload_is_rejected()
    {
        Assert.Equal(ImageRejection.Empty, Processor().Process([]).Rejection);
    }

    [Fact]
    public void Bytes_that_are_not_an_image_are_rejected()
    {
        var result = Processor().Process(Encoding.UTF8.GetBytes("This is a text file that someone renamed to photo.jpg."));

        Assert.False(result.IsValid);
        Assert.Equal(ImageRejection.Unreadable, result.Rejection);
    }

    [Fact]
    public void A_real_image_in_an_unsupported_format_is_named_as_such()
    {
        // A real, decodable 1×1 GIF. The declared content type is irrelevant either way; the header decides
        // what the file actually is, and an animated format is not something to analyze.
        byte[] gif =
        [
            0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
            0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
            0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
        ];

        var result = Processor().Process(gif);

        Assert.False(result.IsValid);
        Assert.Equal(ImageRejection.UnsupportedType, result.Rejection);
    }

    [Fact]
    public void An_upload_beyond_the_configured_size_is_rejected_before_it_is_decoded()
    {
        var result = Processor(new FoodAnalysisOptions { MaxUploadBytes = 1_024 }).Process(Encode(800, 600));

        Assert.Equal(ImageRejection.TooLarge, result.Rejection);
    }

    [Fact]
    public void A_picture_too_small_to_judge_is_rejected()
    {
        var result = Processor().Process(Encode(32, 32));

        Assert.Equal(ImageRejection.TooSmall, result.Rejection);
    }

    [Fact]
    public void A_decompression_bomb_is_rejected_from_the_header_alone()
    {
        var result = Processor(new FoodAnalysisOptions { MaxImagePixels = 10_000 }).Process(Encode(800, 600));

        Assert.Equal(ImageRejection.TooManyPixels, result.Rejection);
    }

    [Fact]
    public void A_large_photo_is_scaled_down_and_re_encoded_as_jpeg()
    {
        var result = Processor().Process(Encode(2400, 1600, SKEncodedImageFormat.Png));

        Assert.True(result.IsValid);
        var image = result.Image!;
        Assert.Equal("image/jpeg", image.ContentType);
        Assert.Equal(Defaults.MaxStoredDimension, image.Width);
        Assert.Equal(683, image.Height);
        Assert.NotEmpty(image.Bytes);
    }

    [Fact]
    public void A_small_photo_is_kept_at_its_own_size_rather_than_upscaled()
    {
        var result = Processor().Process(Encode(320, 240));

        Assert.True(result.IsValid);
        Assert.Equal(320, result.Image!.Width);
        Assert.Equal(240, result.Image.Height);
    }

    [Fact]
    public void An_orientation_tag_is_baked_into_the_pixels()
    {
        // Orientation 6 means "rotate 90° clockwise to display", so the upright picture is 120×200.
        var result = Processor().Process(WithExifOrientation(Encode(200, 120), orientation: 6));

        Assert.True(result.IsValid, $"rejected as {result.Rejection}");
        Assert.Equal(120, result.Image!.Width);
        Assert.Equal(200, result.Image.Height);
    }

    [Fact]
    public void Metadata_does_not_survive_the_re_encode()
    {
        var tagged = WithExifOrientation(Encode(400, 300), orientation: 1);
        Assert.True(Contains(tagged, "Exif"u8), "The fixture itself must carry an EXIF block.");

        var result = Processor().Process(tagged);

        Assert.True(result.IsValid);
        // The output is written from raw pixels, so no EXIF block — and no GPS inside one — comes along.
        Assert.False(Contains(result.Image!.Bytes, "Exif"u8));
    }

    private static bool Contains(byte[] haystack, ReadOnlySpan<byte> needle) =>
        haystack.AsSpan().IndexOf(needle) >= 0;

    /// <summary>Injects a minimal little-endian EXIF APP1 segment carrying only the orientation tag.</summary>
    private static byte[] WithExifOrientation(byte[] jpeg, ushort orientation)
    {
        byte[] tiff =
        [
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF header, IFD0 at offset 8
            0x01, 0x00,                                     // one entry
            0x12, 0x01,                                     // tag 0x0112 (orientation)
            0x03, 0x00,                                     // type SHORT
            0x01, 0x00, 0x00, 0x00,                         // count 1
            (byte)orientation, 0x00, 0x00, 0x00,            // value
            0x00, 0x00, 0x00, 0x00,                         // no next IFD
        ];

        var payload = new byte[6 + tiff.Length];
        "Exif\0\0"u8.CopyTo(payload);
        tiff.CopyTo(payload, 6);

        var length = payload.Length + 2;
        byte[] segment = [0xFF, 0xE1, (byte)(length >> 8), (byte)(length & 0xFF), .. payload];

        // After the SOI marker, before everything else.
        return [.. jpeg[..2], .. segment, .. jpeg[2..]];
    }
}
