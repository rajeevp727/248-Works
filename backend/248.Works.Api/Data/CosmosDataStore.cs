using Microsoft.Azure.Cosmos;

namespace Works.Api.Data;

public sealed class CosmosDataStore
{
    private readonly CosmosClient _client;
    private readonly IConfiguration _configuration;

    public CosmosDataStore(CosmosClient client, IConfiguration configuration)
    {
        _client = client;
        _configuration = configuration;
    }

    public Container Container =>
        _client.GetContainer(
            _configuration["Cosmos:DatabaseName"] ?? "248WorksDB",
            _configuration["Cosmos:ContainerName"] ?? "248Data");

    public async Task UpsertAsync<T>(T document, CancellationToken cancellationToken = default)
    {
        var idProperty = typeof(T).GetProperty("Id")
            ?? throw new InvalidOperationException("Cosmos documents require an Id property.");

        var typeProperty = typeof(T).GetProperty("Type")
            ?? throw new InvalidOperationException("Cosmos documents require a Type property.");

        var id = idProperty.GetValue(document)?.ToString()
            ?? throw new InvalidOperationException("Document Id cannot be empty.");

        var type = typeProperty.GetValue(document)?.ToString()
            ?? throw new InvalidOperationException("Document Type cannot be empty.");

        await Container.UpsertItemAsync(document, new PartitionKey(type), cancellationToken: cancellationToken);
    }
}
