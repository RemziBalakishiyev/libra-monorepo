using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Common;
using Libra.Application.Nutrition;
using Libra.Domain.Nutrition;

namespace Libra.Api.Nutrition;

internal static class NutritionEndpoints
{
    public static IEndpointRouteBuilder MapNutritionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var nutrition = endpoints
            .MapGroup("/api/nutrition")
            .WithTags("Nutrition")
            .RequireAuthorization();

        MapDay(nutrition);
        MapEntries(nutrition);
        MapGoals(nutrition);

        return endpoints;
    }

    private static void MapDay(RouteGroupBuilder nutrition)
    {
        nutrition.MapGet("/day", async (ClaimsPrincipal principal, NutritionDayHandler handler, CancellationToken cancellationToken, DateOnly? date = null) =>
                Results.Ok(await handler.GetAsync(principal.GetUserId(), date, cancellationToken)))
            .Produces<NutritionDayResponse>();
    }

    private static void MapEntries(RouteGroupBuilder nutrition)
    {
        var group = nutrition.MapGroup("/entries");

        group.MapGet("/", async (ClaimsPrincipal principal, NutritionEntriesHandler handler, CancellationToken cancellationToken,
                int pageNumber = 1, int pageSize = Paging.DefaultPageSize, DateOnly? date = null, DateTimeOffset? from = null, DateTimeOffset? to = null, MealType? mealType = null) =>
            {
                var query = new NutritionEntryListQuery(pageNumber, pageSize, date, from, to, mealType);
                var validation = new NutritionEntryListQueryValidator().Validate(query);
                return validation.IsValid
                    ? Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken))
                    : TypedResults.ValidationProblem(validation.ToDictionary());
            })
            .Produces<PagedResponse<NutritionEntryResponse>>()
            .ProducesValidationProblem();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateNutritionEntryCommand command, NutritionEntriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(entry => $"/api/nutrition/entries/{entry.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateNutritionEntryCommand>>()
            .Produces<NutritionEntryResponse>(StatusCodes.Status201Created)
            .Produces<NutritionEntryResponse>()
            .ProducesValidationProblem();

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, NutritionEntriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<NutritionEntryResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateNutritionEntryCommand command, NutritionEntriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateNutritionEntryCommand>>()
            .Produces<NutritionEntryResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, NutritionEntriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }

    private static void MapGoals(RouteGroupBuilder nutrition)
    {
        var group = nutrition.MapGroup("/goals");

        group.MapGet("/", async (ClaimsPrincipal principal, NutritionGoalsHandler handler, CancellationToken cancellationToken, DateOnly? date = null) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), date, cancellationToken)))
            .Produces<NutritionGoalsResponse>();

        // 200 with the saved targets, 204 when the call cleared them for that effective date.
        group.MapPut("/", async (ClaimsPrincipal principal, SaveNutritionGoalCommand command, NutritionGoalsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.SaveAsync(principal.GetUserId(), command, cancellationToken);
                if (!result.IsSuccess)
                {
                    return result.Error!.ToProblem();
                }

                return result.Value is null ? Results.NoContent() : Results.Ok(result.Value);
            })
            .AddEndpointFilter<ValidationFilter<SaveNutritionGoalCommand>>()
            .Produces<NutritionGoalResponse>()
            .Produces(StatusCodes.Status204NoContent)
            .ProducesValidationProblem();

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, NutritionGoalsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}
