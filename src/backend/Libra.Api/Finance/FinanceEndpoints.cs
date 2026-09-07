using System.Security.Claims;
using Libra.Api.Common;
using Libra.Api.Identity;
using Libra.Application.Common;
using Libra.Application.Finance;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Budgets;
using Libra.Application.Finance.Categories;
using Libra.Application.Finance.Dashboard;
using Libra.Application.Finance.Setup;
using Libra.Application.Finance.Transactions;
using Libra.Application.Finance.Transfers;
using Libra.Domain.Finance;

namespace Libra.Api.Finance;

internal static class FinanceEndpoints
{
    public static IEndpointRouteBuilder MapFinanceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var finance = endpoints
            .MapGroup("/api/finance")
            .WithTags("Finance")
            .RequireAuthorization();

        MapSetup(finance);
        MapAccounts(finance);
        MapCategories(finance);
        MapTransactions(finance);
        MapTransfers(finance);
        MapBudgets(finance);
        MapDashboard(finance);

        return endpoints;
    }

    private static void MapSetup(RouteGroupBuilder finance)
    {
        finance.MapPost("/setup", async (ClaimsPrincipal principal, FinanceSetupCommand command, FinanceSetupHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<FinanceSetupCommand>>()
            .Produces<FinanceSetupResponse>()
            .ProducesValidationProblem();
    }

    private static void MapAccounts(RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/accounts");

        group.MapGet("/", async (ClaimsPrincipal principal, AccountsHandler handler, CancellationToken cancellationToken, bool includeArchived = false) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), includeArchived, cancellationToken)))
            .Produces<IReadOnlyList<AccountResponse>>();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateAccountCommand command, AccountsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreated(account => $"/api/finance/accounts/{account.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateAccountCommand>>()
            .Produces<AccountResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, AccountsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<AccountResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateAccountCommand command, AccountsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateAccountCommand>>()
            .Produces<AccountResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, AccountsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static void MapCategories(RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/categories");

        group.MapGet("/", async (ClaimsPrincipal principal, CategoriesHandler handler, CancellationToken cancellationToken, FinanceCategoryKind? kind = null, bool includeArchived = false) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), kind, includeArchived, cancellationToken)))
            .Produces<IReadOnlyList<CategoryResponse>>();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateCategoryCommand command, CategoriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreated(category => $"/api/finance/categories/{category.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateCategoryCommand>>()
            .Produces<CategoryResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, CategoriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<CategoryResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateCategoryCommand command, CategoriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateCategoryCommand>>()
            .Produces<CategoryResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, CategoriesHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static void MapTransactions(RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/transactions");

        group.MapGet("/", async (ClaimsPrincipal principal, [AsParameters] TransactionListQuery query, TransactionsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken)))
            .AddEndpointFilter<ValidationFilter<TransactionListQuery>>()
            .Produces<PagedResponse<TransactionResponse>>()
            .ProducesValidationProblem();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateTransactionCommand command, TransactionsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(transaction => $"/api/finance/transactions/{transaction.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateTransactionCommand>>()
            .Produces<TransactionResponse>(StatusCodes.Status201Created)
            .Produces<TransactionResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TransactionsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<TransactionResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateTransactionCommand command, TransactionsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateTransactionCommand>>()
            .Produces<TransactionResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TransactionsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }

    private static void MapTransfers(RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/transfers");

        group.MapGet("/", async (ClaimsPrincipal principal, [AsParameters] TransferListQuery query, TransfersHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken)))
            .AddEndpointFilter<ValidationFilter<TransferListQuery>>()
            .Produces<PagedResponse<TransferResponse>>()
            .ProducesValidationProblem();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateTransferCommand command, TransfersHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreatedOrReplayed(transfer => $"/api/finance/transfers/{transfer.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateTransferCommand>>()
            .Produces<TransferResponse>(StatusCodes.Status201Created)
            .Produces<TransferResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TransfersHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<TransferResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateTransferCommand command, TransfersHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateTransferCommand>>()
            .Produces<TransferResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, TransfersHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }

    private static void MapBudgets(RouteGroupBuilder finance)
    {
        var group = finance.MapGroup("/budgets");

        group.MapGet("/", async (ClaimsPrincipal principal, [AsParameters] BudgetListQuery query, BudgetsHandler handler, CancellationToken cancellationToken) =>
                Results.Ok(await handler.ListAsync(principal.GetUserId(), query, cancellationToken)))
            .AddEndpointFilter<ValidationFilter<BudgetListQuery>>()
            .Produces<IReadOnlyList<BudgetResponse>>()
            .ProducesValidationProblem();

        group.MapPost("/", async (ClaimsPrincipal principal, CreateBudgetCommand command, BudgetsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.CreateAsync(principal.GetUserId(), command, cancellationToken);
                return result.ToCreated(budget => $"/api/finance/budgets/{budget.Id}");
            })
            .AddEndpointFilter<ValidationFilter<CreateBudgetCommand>>()
            .Produces<BudgetResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}", async (ClaimsPrincipal principal, Guid id, BudgetsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.GetAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToOk();
            })
            .Produces<BudgetResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (ClaimsPrincipal principal, Guid id, UpdateBudgetCommand command, BudgetsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.UpdateAsync(principal.GetUserId(), id, command, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<UpdateBudgetCommand>>()
            .Produces<BudgetResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapDelete("/{id:guid}", async (ClaimsPrincipal principal, Guid id, BudgetsHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.DeleteAsync(principal.GetUserId(), id, cancellationToken);
                return result.ToNoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound);
    }

    private static void MapDashboard(RouteGroupBuilder finance)
    {
        finance.MapGet("/dashboard", async (ClaimsPrincipal principal, [AsParameters] DashboardQuery query, DashboardHandler handler, CancellationToken cancellationToken) =>
            {
                var result = await handler.HandleAsync(principal.GetUserId(), query, cancellationToken);
                return result.ToOk();
            })
            .AddEndpointFilter<ValidationFilter<DashboardQuery>>()
            .Produces<DashboardResponse>()
            .ProducesValidationProblem();
    }
}
