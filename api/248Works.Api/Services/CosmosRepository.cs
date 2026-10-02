using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;
using Microsoft.Extensions.Options;
using _248Works.Api.Models;

namespace _248Works.Api.Services;

public sealed class CosmosRepository
{
    private const string LaunchState = "Telangana";
    private readonly Container _container;

    public CosmosRepository(CosmosClient client, IOptions<CosmosOptions> options)
    {
        var settings = options.Value;
        _container = client.GetContainer(settings.DatabaseName, settings.ContainerName);
    }

    public async Task<IReadOnlyList<Job>> GetJobsAsync(CancellationToken cancellationToken)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.type = @type AND c.state = @state AND c.isActive = true ORDER BY c.createdAt DESC")
            .WithParameter("@type", "job")
            .WithParameter("@state", LaunchState);

        var iterator = _container.GetItemQueryIterator<Job>(query);
        var results = new List<Job>();

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(cancellationToken);
            results.AddRange(page);
        }

        return results;
    }

    public async Task<Job> CreateJobAsync(Job job, CancellationToken cancellationToken)
    {
        job.type = "job";
        job.state = LaunchState;
        job.id = Guid.NewGuid().ToString("N");
        job.createdAt = DateTime.UtcNow;

        var response = await _container.CreateItemAsync(
            job,
            new PartitionKey(job.type),
            cancellationToken: cancellationToken);

        return response.Resource;
    }

    public async Task<Application> CreateApplicationAsync(
        Application application,
        CancellationToken cancellationToken)
    {
        application.type = "application";
        application.id = Guid.NewGuid().ToString("N");
        application.appliedAt = DateTime.UtcNow;

        var response = await _container.CreateItemAsync(
            application,
            new PartitionKey(application.type),
            cancellationToken: cancellationToken);

        return response.Resource;
    }

    public async Task<User?> GetUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken)
    {
        var query = new QueryDefinition(
            "SELECT TOP 1 * FROM c WHERE c.type = @type AND c.normalizedEmail = @email")
            .WithParameter("@type", "user")
            .WithParameter("@email", normalizedEmail);

        using var iterator = _container.GetItemQueryIterator<User>(query);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(cancellationToken);
            return page.FirstOrDefault();
        }

        return null;
    }

    public async Task<User> UpsertUserAsync(User user, CancellationToken cancellationToken)
    {
        user.updatedAt = DateTime.UtcNow;
        var response = await _container.UpsertItemAsync(
            user,
            new PartitionKey(user.type),
            cancellationToken: cancellationToken);
        return response.Resource;
    }

    public async Task SaveOtpAsync(EmailOtp otp, CancellationToken cancellationToken)
    {
        await _container.CreateItemAsync(
            otp,
            new PartitionKey(otp.type),
            cancellationToken: cancellationToken);
    }

    public async Task<EmailOtp?> GetLatestOtpAsync(string normalizedEmail, CancellationToken cancellationToken)
    {
        var query = new QueryDefinition(
            "SELECT TOP 1 * FROM c WHERE c.type = @type AND c.normalizedEmail = @email AND c.consumed = false ORDER BY c.createdAt DESC")
            .WithParameter("@type", "emailOtp")
            .WithParameter("@email", normalizedEmail);

        using var iterator = _container.GetItemQueryIterator<EmailOtp>(query);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(cancellationToken);
            return page.FirstOrDefault();
        }

        return null;
    }

    public async Task ConsumeOtpAsync(EmailOtp otp, CancellationToken cancellationToken)
    {
        otp.consumed = true;
        await _container.ReplaceItemAsync(
            otp,
            otp.id,
            new PartitionKey(otp.type),
            cancellationToken: cancellationToken);
    }

    public async Task SaveSessionAsync(AuthSession session, CancellationToken cancellationToken)
    {
        await _container.CreateItemAsync(
            session,
            new PartitionKey(session.type),
            cancellationToken: cancellationToken);
    }

    public async Task<AuthSession?> GetSessionByTokenHashAsync(string tokenHash, CancellationToken cancellationToken)
    {
        var query = new QueryDefinition(
            "SELECT TOP 1 * FROM c WHERE c.type = @type AND c.tokenHash = @hash AND c.revoked = false")
            .WithParameter("@type", "authSession")
            .WithParameter("@hash", tokenHash);

        using var iterator = _container.GetItemQueryIterator<AuthSession>(query);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(cancellationToken);
            return page.FirstOrDefault();
        }

        return null;
    }

    public async Task RevokeSessionAsync(AuthSession session, CancellationToken cancellationToken)
    {
        session.revoked = true;
        await _container.ReplaceItemAsync(
            session,
            session.id,
            new PartitionKey(session.type),
            cancellationToken: cancellationToken);
    }
}
