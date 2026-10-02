FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY api/248Works.Api/248Works.Api.csproj api/248Works.Api/
RUN dotnet restore api/248Works.Api/248Works.Api.csproj
COPY . .
RUN dotnet publish api/248Works.Api/248Works.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:10000
EXPOSE 10000
ENTRYPOINT ["dotnet","248Works.Api.dll"]
