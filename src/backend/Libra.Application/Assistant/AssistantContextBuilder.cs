using System.Globalization;
using Libra.Application.Common;
using Libra.Application.Finance;
using Libra.Application.Finance.Dashboard;
using Libra.Application.Focus;
using Libra.Application.Nutrition;
using Libra.Application.Sleep;
using Libra.Application.Tasks;

namespace Libra.Application.Assistant;

/// <summary>Which period the user asked about. Both are resolved in their own time zone.</summary>
[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter<AssistantPeriod>))]
public enum AssistantPeriod
{
    Today = 0,
    LastSevenDays = 1,
}

/// <summary>
/// Builds the bounded snapshot the assistant is allowed to see.
///
/// Every figure comes from the same aggregate the corresponding screen uses, so the assistant cannot disagree
/// with what the user sees — and because those aggregates are computed over the whole matching set, a figure
/// here is never the sum of one page.
///
/// The domain rules each module cares about are preserved deliberately, and stated on the facts themselves:
/// currencies stay separate and transfers are not expenses; nutrition describes what was logged; a missing
/// record is not a zero; an open sleep session is not a completed night; today's tasks and overdue tasks are
/// counted apart; focus time excludes breaks and pauses.
///
/// A module that cannot be read is reported <see cref="FactAvailability.Unavailable"/> and never substituted.
/// </summary>
public sealed class AssistantContextBuilder(
    DashboardHandler dashboard,
    NutritionDayHandler nutritionDay,
    TasksHandler tasks,
    SleepHandler sleep,
    FocusHandler focus,
    ILibraDbContext db,
    TimeProvider clock)
{
    public async Task<AssistantContextSnapshot> BuildAsync(
        Guid userId,
        IReadOnlyCollection<AssistantModule> modules,
        AssistantPeriod period,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(modules);

        var timeZone = await UserTimeZone.LoadAsync(db, userId, cancellationToken);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var today = LocalCalendar.ToLocalDate(timeZone, nowUtc);
        var from = period == AssistantPeriod.Today ? today : today.AddDays(-6);
        var selected = modules.Distinct().OrderBy(module => module).ToArray();

        var facts = new List<AssistantFact>();
        foreach (var module in selected)
        {
            // One module failing is not the whole snapshot failing: the rest is still worth answering from.
            try
            {
                switch (module)
                {
                    case AssistantModule.Finance:
                        facts.AddRange(await FinanceFactsAsync(userId, today, cancellationToken));
                        break;
                    case AssistantModule.Nutrition:
                        facts.AddRange(await NutritionFactsAsync(userId, today, cancellationToken));
                        break;
                    case AssistantModule.Tasks:
                        facts.AddRange(await TaskFactsAsync(userId, today, cancellationToken));
                        break;
                    case AssistantModule.Sleep:
                        facts.AddRange(await SleepFactsAsync(userId, today, cancellationToken));
                        break;
                    default:
                        facts.AddRange(await FocusFactsAsync(userId, today, cancellationToken));
                        break;
                }
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                facts.Add(Unavailable(module, today));
            }
        }

        return new AssistantContextSnapshot
        {
            SchemaVersion = AssistantContextSnapshot.CurrentSchemaVersion,
            TimeZone = timeZone,
            Today = today,
            RangeFrom = from,
            RangeTo = today,
            CollectedAtUtc = nowUtc,
            Modules = selected,
            Facts = facts,
        };
    }

    // ── Finance ──────────────────────────────────────────────────────────────────────────────────────────
    private async Task<IReadOnlyList<AssistantFact>> FinanceFactsAsync(Guid userId, DateOnly today, CancellationToken cancellationToken)
    {
        var result = await dashboard.HandleAsync(userId, new DashboardQuery(null, null, null), cancellationToken);
        if (!result.IsSuccess || result.Value is null)
        {
            return [Unavailable(AssistantModule.Finance, today)];
        }

        var data = result.Value;
        var month = string.Create(CultureInfo.InvariantCulture, $"{data.Year}-{data.Month:D2}");
        var currency = data.CurrencyCode;
        // Nothing recorded this month is not a month of zero spending, and the assistant must not read it so.
        var hasActivity = data.MonthlyIncome != 0 || data.MonthlyExpense != 0;
        var availability = hasActivity ? FactAvailability.Available : FactAvailability.NoRecords;
        // No account at all is not a balance of zero either: a user who has not set finance up has no balance
        // to report, and the assistant must not describe that as having nothing.
        var hasAccounts = data.Accounts.Count > 0 || data.OtherCurrencies.Count > 0;

        var facts = new List<AssistantFact>
        {
            Money("finance.balance", "Hesab balansı", data.TotalBalance, currency, Iso(today),
                hasAccounts ? FactAvailability.Available : FactAvailability.NoRecords,
                "Yalnız " + currency + " hesabları; digər valyutalar ayrıca saxlanılır."),
            Money("finance.expense.month", "Bu ayın xərci", data.MonthlyExpense, currency, month, availability,
                "Köçürmələr xərc deyil və bu rəqəmə daxil edilmir."),
            Money("finance.income.month", "Bu ayın gəliri", data.MonthlyIncome, currency, month, availability),
            Money("finance.net.month", "Bu ayın xalis axını", data.MonthlyNet, currency, month, availability, "Gəlir − xərc."),
            Money("finance.expense.daily", "Gündəlik orta xərc", data.DailyAverageExpense, currency, month, availability,
                string.Create(CultureInfo.InvariantCulture, $"Ayın keçən {data.DaysElapsed} günü üzrə.")),
        };

        if (data.OverallBudget is BudgetSummary budget)
        {
            facts.Add(Money("finance.budget.remaining", "Ümumi büdcədə qalıq", budget.RemainingAmount, currency, month, FactAvailability.Available));
        }

        // Other currencies are listed as their own facts rather than converted into one total.
        foreach (var other in data.OtherCurrencies)
        {
            facts.Add(Money($"finance.balance.{other.CurrencyCode.ToLowerInvariant()}", $"{other.CurrencyCode} balansı", other.TotalBalance, other.CurrencyCode,
                Iso(today), FactAvailability.Available, "Valyutalar bir-birinə çevrilmir."));
        }

        var topCategory = data.ExpenseByCategory.Count > 0 ? data.ExpenseByCategory[0] : null;
        if (topCategory is not null)
        {
            facts.Add(new AssistantFact
            {
                Id = "finance.expense.top-category",
                Module = AssistantModule.Finance,
                Label = "Ən çox xərc olunan kateqoriya",
                Availability = FactAvailability.Available,
                Value = topCategory.Amount,
                Unit = currency,
                Text = topCategory.CategoryName,
                Period = month,
                SourceRoute = "/finance",
            });
        }

        return facts;
    }

    // ── Nutrition ────────────────────────────────────────────────────────────────────────────────────────
    private async Task<IReadOnlyList<AssistantFact>> NutritionFactsAsync(Guid userId, DateOnly today, CancellationToken cancellationToken)
    {
        var day = await nutritionDay.GetAsync(userId, today, cancellationToken);
        var date = Iso(today);
        // An empty diary means nothing was written down, which is not the same as eating nothing.
        var availability = day.EntryCount > 0 ? FactAvailability.Available : FactAvailability.NoRecords;
        const string caveat = "Yalnız qeyd edilmiş yeməklər; qeyd olunmayanlar daxil deyil.";

        var facts = new List<AssistantFact>
        {
            Measure("nutrition.energy.today", "Bu gün alınan enerji", day.Totals.EnergyKcal, "kkal", date, availability, caveat, "/nutrition"),
            Measure("nutrition.protein.today", "Zülal", day.Totals.ProteinGrams, "q", date, availability, caveat, "/nutrition"),
            Measure("nutrition.carb.today", "Karbohidrat", day.Totals.CarbGrams, "q", date, availability, caveat, "/nutrition"),
            Measure("nutrition.fat.today", "Yağ", day.Totals.FatGrams, "q", date, availability, caveat, "/nutrition"),
            Measure("nutrition.entries.today", "Qeyd sayı", day.EntryCount, "qeyd", date, FactAvailability.Available, null, "/nutrition"),
        };

        if (day.Goal is NutritionGoalResponse goal && goal.EnergyKcal is decimal target)
        {
            facts.Add(Measure("nutrition.energy.goal", "Kalori hədəfi", target, "kkal", date, FactAvailability.Available, null, "/nutrition/goals"));
        }
        else
        {
            facts.Add(new AssistantFact
            {
                Id = "nutrition.energy.goal",
                Module = AssistantModule.Nutrition,
                Label = "Kalori hədəfi",
                Availability = FactAvailability.NoRecords,
                Period = date,
                Caveat = "Hədəf təyin edilməyib.",
                SourceRoute = "/nutrition/goals",
            });
        }

        return facts;
    }

    // ── Tasks ────────────────────────────────────────────────────────────────────────────────────────────
    private async Task<IReadOnlyList<AssistantFact>> TaskFactsAsync(Guid userId, DateOnly today, CancellationToken cancellationToken)
    {
        var day = await tasks.GetDayAsync(userId, today, cancellationToken);
        var date = Iso(today);
        var counts = day.Counts;
        var scheduled = counts.Scheduled > 0 ? FactAvailability.Available : FactAvailability.NoRecords;

        return
        [
            Measure("tasks.scheduled.today", "Bu günə planlaşdırılan tapşırıqlar", counts.Scheduled, "tapşırıq", date, scheduled, null, "/plan"),
            Measure("tasks.completed.today", "Bu gün tamamlananlar", counts.Completed, "tapşırıq", date, scheduled, null, "/plan"),
            Measure("tasks.remaining.today", "Bu gün qalanlar", Math.Max(0, counts.Scheduled - counts.Completed), "tapşırıq", date, scheduled, null, "/plan"),
            // Overdue work is counted apart from today's, and stays apart in the answer.
            Measure("tasks.overdue", "Gecikmiş tapşırıqlar", counts.Overdue, "tapşırıq", date, FactAvailability.Available,
                "Əvvəlki günlərdən qalan tapşırıqlar; bu günün sayına daxil deyil.", "/plan"),
        ];
    }

    // ── Sleep ────────────────────────────────────────────────────────────────────────────────────────────
    private async Task<IReadOnlyList<AssistantFact>> SleepFactsAsync(Guid userId, DateOnly today, CancellationToken cancellationToken)
    {
        var summary = await sleep.GetSummaryAsync(userId, today, cancellationToken);
        // The sleep summary is always the last seven local days, so these facts state that window rather than
        // the period the question was scoped to: a seven-day average must never be labelled as one day.
        var window = $"{Iso(today.AddDays(-(SleepHandler.SummaryDays - 1)))}..{Iso(today)}";
        // The average is over the days that actually hold a record, never over seven.
        var availability = summary.RecordedDays switch
        {
            0 => FactAvailability.NoRecords,
            7 => FactAvailability.Available,
            _ => FactAvailability.Partial,
        };

        var facts = new List<AssistantFact>
        {
            Measure("sleep.average.week", "Orta yuxu (son 7 gün)", summary.AverageMinutes, "dəqiqə", window, availability,
                string.Create(CultureInfo.InvariantCulture, $"{summary.RecordedDays} günün qeydi üzrə orta; qeyd olmayan günlər sıfır sayılmır."), "/sleep"),
            Measure("sleep.recorded-days.week", "Qeyd olunan gecə sayı", summary.RecordedDays, "gecə", window, FactAvailability.Available, null, "/sleep"),
        };

        var lastNight = summary.Days.LastOrDefault(day => day.TotalMinutes is not null);
        facts.Add(lastNight is null
            ? new AssistantFact
            {
                Id = "sleep.last-night",
                Module = AssistantModule.Sleep,
                Label = "Son qeyd olunan gecə",
                Availability = FactAvailability.NoRecords,
                Period = window,
                Caveat = "Tamamlanmış yuxu qeydi yoxdur.",
                SourceRoute = "/sleep",
            }
            : Measure("sleep.last-night", "Son qeyd olunan gecə", lastNight.TotalMinutes, "dəqiqə", Iso(lastNight.Date),
                FactAvailability.Available, "Oyanma gününə görə hesablanır.", "/sleep"));

        // A session still running is not a night: it is reported as its own fact, with no duration.
        if (summary.Active is not null)
        {
            facts.Add(new AssistantFact
            {
                Id = "sleep.open-session",
                Module = AssistantModule.Sleep,
                Label = "Davam edən yuxu sessiyası",
                Availability = FactAvailability.Partial,
                Text = "Açıq sessiya var",
                Period = Iso(today),
                Caveat = "Bitməyib, ona görə heç bir ortalamaya daxil edilmir.",
                SourceRoute = "/sleep",
            });
        }

        return facts;
    }

    // ── Focus ────────────────────────────────────────────────────────────────────────────────────────────
    private async Task<IReadOnlyList<AssistantFact>> FocusFactsAsync(Guid userId, DateOnly today, CancellationToken cancellationToken)
    {
        var summary = await focus.GetSummaryAsync(userId, today, cancellationToken);
        var date = Iso(today);
        var day = summary.Today;
        var availability = day.CompletedSessions > 0 || day.StoppedSessions > 0 ? FactAvailability.Available : FactAvailability.NoRecords;
        const string caveat = "Fasilələr və pauzalar bu müddətə daxil deyil.";

        return
        [
            Measure("focus.minutes.today", "Bu gün fokus vaxtı", Math.Round(day.ActiveSeconds / 60m, 1), "dəqiqə", date, availability, caveat, "/plan/focus"),
            Measure("focus.completed.today", "Tamamlanmış fokus sessiyaları", day.CompletedSessions, "sessiya", date, availability,
                "Yalnız təyin edilmiş müddəti tamamlayanlar.", "/plan/focus"),
            Measure("focus.stopped.today", "Yarımçıq dayandırılanlar", day.StoppedSessions, "sessiya", date, availability,
                "Vaxtı çatmadan dayandırılanlar; tamamlanmış sayılmır.", "/plan/focus"),
        ];
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────
    private static AssistantFact Money(string id, string label, decimal value, string currency, string period, FactAvailability availability, string? caveat = null) =>
        new()
        {
            Id = id,
            Module = AssistantModule.Finance,
            Label = label,
            Availability = availability,
            Value = availability is FactAvailability.Available or FactAvailability.Partial ? value : null,
            Unit = currency,
            Period = period,
            Caveat = caveat,
            SourceRoute = "/finance",
        };

    private static AssistantFact Measure(string id, string label, decimal? value, string unit, string period, FactAvailability availability, string? caveat = null, string? route = null)
    {
        var module = id.Split('.')[0] switch
        {
            "nutrition" => AssistantModule.Nutrition,
            "tasks" => AssistantModule.Tasks,
            "sleep" => AssistantModule.Sleep,
            "focus" => AssistantModule.Focus,
            _ => AssistantModule.Finance,
        };
        return new AssistantFact
        {
            Id = id,
            Module = module,
            Label = label,
            Availability = value is null ? FactAvailability.NoRecords : availability,
            Value = availability is FactAvailability.Available or FactAvailability.Partial ? value : null,
            Unit = unit,
            Period = period,
            Caveat = caveat,
            SourceRoute = route,
        };
    }

    /// <summary>Dates inside a snapshot are invariant ISO labels, never formatted for a locale.</summary>
    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static AssistantFact Unavailable(AssistantModule module, DateOnly today) => new()
    {
        Id = $"{module.ToString().ToLowerInvariant()}.unavailable",
        Module = module,
        Label = module switch
        {
            AssistantModule.Finance => "Maliyyə məlumatı",
            AssistantModule.Nutrition => "Qidalanma məlumatı",
            AssistantModule.Tasks => "Tapşırıq məlumatı",
            AssistantModule.Sleep => "Yuxu məlumatı",
            _ => "Fokus məlumatı",
        },
        Availability = FactAvailability.Unavailable,
        Period = Iso(today),
        Caveat = "Bu modul oxuna bilmədi.",
    };
}
