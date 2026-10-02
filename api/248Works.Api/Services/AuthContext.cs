using System.Security.Cryptography;
using System.Text;
using _248Works.Api.Models;

namespace _248Works.Api.Services;

public sealed class AuthContext(CosmosRepository repository)
{
    public async Task<User?> GetUserAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (!request.Headers.TryGetValue("Authorization", out var value)) return null;
        var raw = value.ToString();
        if (!raw.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var token = raw["Bearer ".Length..].Trim();
        if (string.IsNullOrWhiteSpace(token)) return null;

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"248works|session|{token}")));
        var session = await repository.GetSessionByTokenHashAsync(hash, cancellationToken);
        if (session is null || session.revoked || session.expiresAt <= DateTime.UtcNow) return null;

        return await repository.GetUserByIdAsync(session.userId, cancellationToken);
    }
}
