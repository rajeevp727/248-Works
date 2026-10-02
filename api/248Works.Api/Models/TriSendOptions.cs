namespace _248Works.Api.Models;

public sealed class TriSendOptions
{
    public string BaseUrl { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "248 Works";
}
