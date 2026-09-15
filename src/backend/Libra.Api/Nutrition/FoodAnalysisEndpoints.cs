using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Nutrition;
using Libra.Application.Nutrition.FoodAnalysis;
using Microsoft.Extensions.Options;

namespace Libra.Api.Nutrition;

/// <summary>
/// Photo analysis endpoints. Uploading a picture produces a draft and nothing else; the diary changes only when
/// the user confirms reviewed items through <c>/confirm</c>, which is an ordinary nutrition create underneath.
/// </summary>
internal static class FoodAnalysisEndpoints
{
    public static IEndpointRouteBuilder MapFoodAnalysisEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/nutrition/food-analysis")
            .WithTags("Nutrition")
            .RequireAuthorization();

        group.MapPost("/", async (
                ClaimsPrincipal principal,
                IFormFile photo,
                FoodAnalysisHandler handler,
                IOptions<FoodAnalysisOptions> options,
                CancellationToken cancellationToken,
                Guid? clientRequestId = null) =>
            {
                if (photo.Length == 0)
                {
                    return Results.Problem(title: "Image was rejected", detail: "The file is empty.", statusCode: StatusCodes.Status400BadRequest);
                }

                if (photo.Length > options.Value.MaxUploadBytes)
                {
                    return Results.Problem(title: "Image was rejected", detail: "The picture is too large.", statusCode: StatusCodes.Status413PayloadTooLarge);
                }

                using var buffer = new MemoryStream();
                await photo.CopyToAsync(buffer, cancellationToken);
                var command = new AnalyzeFoodPhotoCommand(buffer.ToArray(), photo.ContentType, photo.FileName, clientRequestId);
                var result = await handler.AnalyzeAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(draft => $"/api/nutrition/food-analysis/{draft.Id}");
            })
            .DisableAntiforgery()
            .Produces<FoodAnalysisDraftResponse>(StatusCodes.Status201Created)
            .Produces<FoodAnalysisDraftResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .ProducesProblem(StatusCodes.Status504GatewayTimeout);

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, FoodAnalysisHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<FoodAnalysisDraftResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        // The picture itself, for the review screen. A foreign id is indistinguishable from a missing one.
        group.MapGet("/images/{imageId:guid}", async (ClaimsPrincipal principal, Guid imageId, FoodAnalysisHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetImageAsync(principal.GetUserId(), imageId, cancellationToken);
                return result.IsSuccess
                    ? Results.File(result.Value!.Bytes, result.Value.ContentType)
                    : result.Error!.ToProblem();
            })
            .Produces<IResult>(StatusCodes.Status200OK, "image/jpeg")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/{id:guid}/confirm", async (ClaimsPrincipal principal, Guid id, ConfirmFoodAnalysisCommand command, FoodAnalysisHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.ConfirmAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToCreatedOrReplayed(entry => $"/api/nutrition/entries/{entry.Id}");
            })
            .AddEndpointFilter<ValidationFilter<ConfirmFoodAnalysisCommand>>()
            .Produces<NutritionEntryResponse>(StatusCodes.Status201Created)
            .Produces<NutritionEntryResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, FoodAnalysisHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DiscardAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return endpoints;
    }
}
