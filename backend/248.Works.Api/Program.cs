using Microsoft.Azure.Cosmos;
using Works.Api.Data;
using Works.Api.Migrations;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var endpoint = config["Cosmos:Endpoint"] ?? Environment.GetEnvironmentVariable("COSMOS_ENDPOINT");
    var key = config["Cosmos:Key"] ?? Environment.GetEnvironmentVariable("COSMOS_KEY");

    if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(key))
        throw new InvalidOperationException("COSMOS_ENDPOINT and COSMOS_KEY must be configured.");

    return new CosmosClient(endpoint, key);
});

builder.Services.AddSingleton<CosmosDataStore>();
builder.Services.AddSingleton<MigrationRunner>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "248-works-api" }));
app.MapControllers();

app.Run();
