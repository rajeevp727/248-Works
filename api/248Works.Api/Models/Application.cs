namespace _248Works.Api.Models;

public sealed class Application
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string type { get; set; } = "application";
    public string jobId { get; set; } = "";
    public string candidateId { get; set; } = "";
    public string candidateName { get; set; } = "";
    public string status { get; set; } = "Applied";
    public DateTime appliedAt { get; set; } = DateTime.UtcNow;
}
