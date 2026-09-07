using System.Reflection;
using Libra.Infrastructure.Persistence;

namespace Libra.UnitTests.Architecture;

/// <summary>
/// Guards the modular-monolith layering: Domain depends on nothing, Application depends on Domain only,
/// Infrastructure never references the API host.
/// </summary>
public sealed class DependencyDirectionTests
{
    private static readonly Assembly DomainAssembly = typeof(Domain.AssemblyMarker).Assembly;
    private static readonly Assembly ApplicationAssembly = typeof(Application.AssemblyMarker).Assembly;
    private static readonly Assembly InfrastructureAssembly = typeof(LibraDbContext).Assembly;

    [Fact]
    public void Domain_does_not_reference_other_Libra_assemblies()
    {
        var libraReferences = ReferencedLibraAssemblies(DomainAssembly);

        Assert.Empty(libraReferences);
    }

    [Fact]
    public void Application_references_at_most_Domain()
    {
        // The compiler only records references that are actually used, so this is an upper bound.
        var libraReferences = ReferencedLibraAssemblies(ApplicationAssembly);

        Assert.Subset(new HashSet<string>(StringComparer.Ordinal) { "Libra.Domain" }, libraReferences.ToHashSet(StringComparer.Ordinal));
    }

    [Fact]
    public void Infrastructure_does_not_reference_Api()
    {
        var libraReferences = ReferencedLibraAssemblies(InfrastructureAssembly);

        Assert.DoesNotContain("Libra.Api", libraReferences);
    }

    private static string[] ReferencedLibraAssemblies(Assembly assembly) =>
        assembly
            .GetReferencedAssemblies()
            .Select(reference => reference.Name)
            .Where(name => name is not null && name.StartsWith("Libra.", StringComparison.Ordinal))
            .Select(name => name!)
            .Order(StringComparer.Ordinal)
            .ToArray();
}
