namespace _248Works.Api.Models;

public sealed class Job
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "job";
    public string title { get; set; } = "";
    public string company { get; set; } = "";
    public string location { get; set; } = "";
    public string state { get; set; } = "Telangana";
    public string salary { get; set; } = "";
    public string category { get; set; } = "";
    public string jobType { get; set; } = "Full-time";
    public string description { get; set; } = "";
    public int vacancies { get; set; } = 1;
    public bool isActive { get; set; } = true;
    public DateTime createdAt { get; set; } = DateTime.UtcNow;
}
