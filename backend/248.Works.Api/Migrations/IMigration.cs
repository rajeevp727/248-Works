namespace Works.Api.Migrations;

public interface IMigration
{
    string Id { get; }
    Task UpAsync(CancellationToken cancellationToken = default);
}
