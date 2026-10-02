namespace _248Works.Api.Models;

public sealed class EmployerProfile
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "employerProfile";
    public string userId { get; set; } = "";
    public string businessName { get; set; } = "";
    public string location { get; set; } = "";
    public string state { get; set; } = "Telangana";
    public string? phone { get; set; }
    public string? gstin { get; set; }
    public string verificationStatus { get; set; } = "Pending";
    public DateTime createdAt { get; set; } = DateTime.UtcNow;
}
