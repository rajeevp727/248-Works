using Microsoft.Azure.Cosmos;
using Works.Api.Data;

namespace Works.Api.Migrations;

public sealed class MigrationRunner
{
    private const string MigrationType = "migration";
    private readonly CosmosDataStore _store;
    private readonly ILogger<MigrationRunner> _logger;
    private readonly IReadOnlyList<IMigration> _migrations;

    public MigrationRunner(
        CosmosDataStore store,
        ILogger<MigrationRunner> logger,
        IEnumerable<IMigration> migrations)
    {
        _store = store;
        _logger = logger;
        _migrations = migrations.OrderBy(x => x.Id).ToList();
    }

    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        await EnsureContainerAsync(cancellationToken);

        foreach (var migration in _migrations)
        {
            if (await IsAppliedAsync(migration.Id, cancellationToken))
            {
                _logger.LogInformation("Migration {MigrationId} already applied.", migration.Id);
                continue;
            }

            _logger.LogInformation("Applying migration {MigrationId}.", migration.Id);
            await migration.UpAsync(cancellationToken);

            await _store.Container.UpsertItemAsync(
                new MigrationRecord
                {
                    Id = migration.Id,
                    Type = MigrationType,
                    AppliedAtUtc = DateTime.UtcNow
                },
                new PartitionKey(MigrationType),
                cancellationToken: cancellationToken);
        }
    }

    private async Task<bool> IsAppliedAsync(string migrationId, CancellationToken cancellationToken)
    {
        try
        {
            var response = await _store.Container.ReadItemAsync<MigrationRecord>(
                migrationId,
                new PartitionKey(MigrationType),
                cancellationToken: cancellationToken);

            return response.Resource is not null;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private async Task EnsureContainerAsync(CancellationToken cancellationToken)
    {
        var databaseName = _store.Container.Database.Id;
        await _store.Container.Database.CreateContainerIfNotExistsAsync(
            new ContainerProperties(_store.Container.Id, "/type"),
            throughput: null,
            cancellationToken: cancellationToken);
    }

    private sealed class MigrationRecord
    {
        public string Id { get; set; } = "";
        public string Type { get; set; } = MigrationType;
        public DateTime AppliedAtUtc { get; set; }
    }
}
