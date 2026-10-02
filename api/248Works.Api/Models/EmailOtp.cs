namespace _248Works.Api.Models;

public sealed class EmailOtp
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "emailOtp";
    public string normalizedEmail { get; set; } = "";
    public string codeHash { get; set; } = "";
    public int attempts { get; set; }
    public DateTime expiresAt { get; set; }
    public DateTime createdAt { get; set; } = DateTime.UtcNow;
    public bool consumed { get; set; }
}
