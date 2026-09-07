# Build context must be the repository root:
#   docker build -f src/backend/Dockerfile -t libra-api .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo

COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/backend/Libra.Domain/Libra.Domain.csproj src/backend/Libra.Domain/
COPY src/backend/Libra.Application/Libra.Application.csproj src/backend/Libra.Application/
COPY src/backend/Libra.Infrastructure/Libra.Infrastructure.csproj src/backend/Libra.Infrastructure/
COPY src/backend/Libra.Api/Libra.Api.csproj src/backend/Libra.Api/
RUN dotnet restore src/backend/Libra.Api/Libra.Api.csproj

COPY src/backend/ src/backend/
RUN dotnet publish src/backend/Libra.Api/Libra.Api.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# Npgsql probes GSSAPI at connection time; without this library it logs "Cannot load library libgssapi_krb5.so.2".
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Libra.Api.dll"]
