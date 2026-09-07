using System.Text.Json.Serialization;

namespace Libra.Domain.Finance;

// These enums are part of the API contract and are always serialized by name.

[JsonConverter(typeof(JsonStringEnumConverter<FinancialAccountType>))]
public enum FinancialAccountType
{
    Cash,
    BankCard,
    BankAccount,
    Savings,
    Other,
}

[JsonConverter(typeof(JsonStringEnumConverter<FinanceCategoryKind>))]
public enum FinanceCategoryKind
{
    Income,
    Expense,
}

[JsonConverter(typeof(JsonStringEnumConverter<FinancialTransactionType>))]
public enum FinancialTransactionType
{
    Income,
    Expense,
}
