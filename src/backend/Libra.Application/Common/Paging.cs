namespace Libra.Application.Common;

public sealed record PagedResponse<TItem>(IReadOnlyList<TItem> Items, int PageNumber, int PageSize, int TotalCount)
{
    public bool HasNextPage => PageNumber * PageSize < TotalCount;
}

public static class Paging
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public static bool IsValid(int pageNumber, int pageSize) =>
        pageNumber >= 1 && pageSize >= 1 && pageSize <= MaxPageSize;
}
