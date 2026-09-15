using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Common;
using Libra.Application.Finance.Debts;

namespace Libra.Api.Finance;

/// <summary>/api/finance/debts: obligations, their payments, and the per-currency position.</summary>
internal static class DebtEndpoints
{
    public static RouteGroupBuilder MapDebtEndpoints(this RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/debts");

        group.MapGet("/", async (ClaimsPrincipal principal, [AsParameters] DebtListQuery query, DebtsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken)))
            .AddEndpointFilter<ValidationFilter<DebtListQuery>>()
            .Produces<PagedResponse<DebtResponse>>()
            .ProducesValidationProblem();

        group.MapGet("/summary", async (ClaimsPrincipal principal, DebtsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.SummaryAsync(principal.GetUserId(), cancellationToken)))
            .Produces<DebtSummaryResponse>();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateDebtCommand command, DebtsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(detail => $"/api/finance/debts/{detail.Debt.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateDebtCommand>>()
            .Produces<DebtDetailResponse>(StatusCodes.Status201Created)
            .Produces<DebtDetailResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, DebtsHandler handler, CancellationToken cancellationToken) =>
                (await handler.GetAsync(principal.GetUserId(), id, cancellationToken)).ToOk())
            .Produces<DebtDetailResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateDebtCommand command, DebtsHandler handler, CancellationToken cancellationToken) =>
                (await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken)).ToOk())
            .AddEndpointFilter<ValidationFilter<UpdateDebtCommand>>()
            .Produces<DebtDetailResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, DebtsHandler handler, CancellationToken cancellationToken) =>
                (await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken)).ToNoContent())
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{id:guid}/payments", async (ClaimsPrincipal principal, Guid id, RecordDebtPaymentCommand command, DebtsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.RecordPaymentAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToCreatedOrReplayed(detail => $"/api/finance/debts/{detail.Debt.Id}");
            })
            .AddEndpointFilter<ValidationFilter<RecordDebtPaymentCommand>>()
            .Produces<DebtDetailResponse>(StatusCodes.Status201Created)
            .Produces<DebtDetailResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{id:guid}/payments/{paymentId:guid}/undo", async (ClaimsPrincipal principal, Guid id, Guid paymentId, DebtsHandler handler, CancellationToken cancellationToken) =>
                (await handler.UndoPaymentAsync(principal.GetUserId(), id, paymentId, cancellationToken)).ToOk())
            .Produces<DebtDetailResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return group;
    }
}
