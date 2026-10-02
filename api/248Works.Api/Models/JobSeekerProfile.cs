namespace _248Works.Api.Models;

public sealed class JobSeekerProfile
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "jobSeekerProfile";
    public string userId { get; set; } = "";
    public string fullName { get; set; } = "";
    public string location { get; set; } = "";
    public string state { get; set; } = "Telangana";
    public string[] skills { get; set; } = [];
    public int? experienceYears { get; set; }
    public DateTime createdAt { get; set; } = DateTime.UtcNow;
}
