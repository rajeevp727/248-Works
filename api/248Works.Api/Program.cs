using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;
using _248Works.Api.Models;
using _248Works.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<CosmosOptions>(builder.Configuration.GetSection("Cosmos"));
builder.Services.Configure<TriSendOptions>(builder.Configuration.GetSection("TriSend"));

builder.Services.AddSingleton(sp =>
{
    var options = sp.GetRequiredService<IOptions<CosmosOptions>>().Value;
    var connectionString = options.ConnectionString;
    if (string.IsNullOrWhiteSpace(connectionString))
        throw new InvalidOperationException("Cosmos:ConnectionString is not configured.");
    return new CosmosClient(connectionString);
});

builder.Services.AddHttpClient<TriSendEmailClient>();
builder.Services.AddSingleton<CosmosRepository>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactClient", policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors("ReactClient");
app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/api/health", () => Results.Ok(new
{
    service = "248 Works API",
    status = "ok",
    utc = DateTime.UtcNow
}));

app.MapControllers();

app.Run();
