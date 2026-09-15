using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Finance.Recurring;

namespace Libra.Api.Finance;

/// <summary>
/// /api/finance/recurring. Reading a month never writes; money is recorded only through the explicit
/// <c>record</c> action on one template and one month, which is idempotent per month.
/// </summary>
internal static class RecurringEndpoints
{
    public static RouteGroupBuilder MapRecurringEndpoints(this RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/recurring");

        group.MapGet("/", async (ClaimsPrincipal principal, [AsParameters] RecurringMonthQuery query, RecurringHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ListMonthAsync(principal.GetUserId(), query, cancellationToken)))
            .AddEndpointFilter<ValidationFilter<RecurringMonthQuery>>()
            .Produces<RecurringMonthResponse>()
            .ProducesValidationProblem();

        group.MapGet("/templates", async (ClaimsPrincipal principal, RecurringHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ListTemplatesAsync(principal.GetUserId(), cancellationToken)))
            .Produces<IReadOnlyList<RecurringTemplateResponse>>();

        group.MapPost("/templates", async (ClaimsPrincipal principal, CreateRecurringTemplateCommand command, RecurringHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateTemplateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(template => $"/api/finance/recurring/templates/{template.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateRecurringTemplateCommand>>()
            .Produces<RecurringTemplateResponse>(StatusCodes.Status201Created)
            .Produces<RecurringTemplateResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/templates/{id:guid}", async (ClaimsPrincipal principal, Guid id, RecurringHandler handler, CancellationToken cancellationToken) =>
                (await handler.GetTemplateAsync(principal.GetUserId(), id, cancellationToken)).ToOk())
            .Produces<RecurringTemplateResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/templates/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateRecurringTemplateCommand command, RecurringHandler handler, CancellationToken cancellationToken) =>
                (await handler.UpdateTemplateAsync(principal.GetUserId(), id, command, cancellationToken)).ToOk())
            .AddEndpointFilter<ValidationFilter<UpdateRecurringTemplateCommand>>()
            .Produces<RecurringTemplateResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/templates/{id:guid}", async (ClaimsPrincipal principal, Guid id, RecurringHandler handler, CancellationToken cancellationToken) =>
                (await handler.DeleteTemplateAsync(principal.GetUserId(), id, cancellationToken)).ToNoContent())
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/templates/{id:guid}/occurrences/{year:int}/{month:int}/record", async (ClaimsPrincipal principal, Guid id, int year, int month, RecordOccurrenceCommand command, RecurringHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.RecordAsync(principal.GetUserId(), id, year, month, command, cancellationToken);
                return result.ToCreatedOrReplayed(recorded => $"/api/finance/transactions/{recorded.Transaction.Id}");
            })
            .AddEndpointFilter<ValidationFilter<RecordOccurrenceCommand>>()
            .Produces<RecordOccurrenceResponse>(StatusCodes.Status201Created)
            .Produces<RecordOccurrenceResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/templates/{id:guid}/occurrences/{year:int}/{month:int}/skip", async (ClaimsPrincipal principal, Guid id, int year, int month, RecurringHandler handler, CancellationToken cancellationToken) =>
                (await handler.SkipAsync(principal.GetUserId(), id, year, month, cancellationToken)).ToOk())
            .Produces<RecurringOccurrenceResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/templates/{id:guid}/occurrences/{year:int}/{month:int}/undo", async (ClaimsPrincipal principal, Guid id, int year, int month, RecurringHandler handler, CancellationToken cancellationToken) =>
                (await handler.UndoAsync(principal.GetUserId(), id, year, month, cancellationToken)).ToOk())
            .Produces<RecurringOccurrenceResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return group;
    }
}
