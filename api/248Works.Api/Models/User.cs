namespace _248Works.Api.Models;

public sealed class User
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "user";
    public string email { get; set; } = "";
    public string normalizedEmail { get; set; } = "";
    public string role { get; set; } = "JobSeeker";
    public string name { get; set; } = "";
    public string? phone { get; set; }
    public string? location { get; set; }
    public string state { get; set; } = "Telangana";
    public bool isEmailVerified { get; set; }
    public bool isActive { get; set; } = true;
    public DateTime createdAt { get; set; } = DateTime.UtcNow;
    public DateTime updatedAt { get; set; } = DateTime.UtcNow;
}
