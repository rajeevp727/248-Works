namespace _248Works.Api.Models;

public sealed class AuthSession
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "authSession";
    public string userId { get; set; } = "";
    public string tokenHash { get; set; } = "";
    public DateTime expiresAt { get; set; }
    public DateTime createdAt { get; set; } = DateTime.UtcNow;
    public bool revoked { get; set; }
}
