namespace _248Works.Api.Models;

public sealed class CosmosOptions
{
    public string ConnectionString { get; set; } = "";
    public string DatabaseName { get; set; } = "248WorksDB";
    public string ContainerName { get; set; } = "248Data";
}
