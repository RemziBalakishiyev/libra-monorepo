using FluentValidation;
using Libra.Application.Finance;
using Libra.Application.Finance.Accounts;
using Libra.Application.Finance.Budgets;
using Libra.Application.Finance.Categories;
using Libra.Application.Finance.Dashboard;
using Libra.Application.Finance.Setup;
using Libra.Application.Finance.Transactions;
using Libra.Application.Finance.Transfers;
using Libra.Application.Identity;
using Libra.Application.Identity.Login;
using Libra.Application.Identity.Logout;
using Libra.Application.Identity.Profile;
using Libra.Application.Identity.RefreshSession;
using Libra.Application.Identity.Register;
using Libra.Domain.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Libra.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddOptions<AuthOptions>()
            .Bind(configuration.GetSection(AuthOptions.SectionName))
            .Validate(options => options.IsValid(), "Auth:AccessTokenMinutes must be 1-1440 and Auth:RefreshTokenDays must be 1-365.")
            .ValidateOnStart();

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddValidatorsFromAssembly(typeof(AssemblyMarker).Assembly, includeInternalTypes: true);

        // Identity
        services.AddScoped<SessionIssuer>();
        services.AddScoped<RegisterHandler>();
        services.AddScoped<LoginHandler>();
        services.AddScoped<RefreshSessionHandler>();
        services.AddScoped<LogoutHandler>();
        services.AddScoped<GetProfileHandler>();
        services.AddScoped<UpdateProfileHandler>();

        // Finance
        services.AddScoped<AccountBalanceCalculator>();
        services.AddScoped<BudgetUsageCalculator>();
        services.AddScoped<AccountsHandler>();
        services.AddScoped<CategoriesHandler>();
        services.AddScoped<FinanceSetupHandler>();
        services.AddScoped<TransactionsHandler>();
        services.AddScoped<TransfersHandler>();
        services.AddScoped<BudgetsHandler>();
        services.AddScoped<DashboardHandler>();

        return services;
    }
}
