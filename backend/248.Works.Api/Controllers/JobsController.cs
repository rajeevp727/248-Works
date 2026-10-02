using Microsoft.Azure.Cosmos;
using Microsoft.AspNetCore.Mvc;

namespace Works.Api.Controllers;

[ApiController]
[Route("api/jobs")]
public sealed class JobsController : ControllerBase
{
    private readonly CosmosClient _cosmos;
    private readonly IConfiguration _configuration;

    public JobsController(CosmosClient cosmos, IConfiguration configuration)
    {
        _cosmos = cosmos;
        _configuration = configuration;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var container = _cosmos.GetContainer(
            _configuration["Cosmos:DatabaseName"] ?? "248WorksDB",
            _configuration["Cosmos:ContainerName"] ?? "248Data");

        var query = new QueryDefinition("SELECT * FROM c WHERE c.type = @type AND c.status = @status")
            .WithParameter("@type", "job")
            .WithParameter("@status", "open");

        var iterator = container.GetItemQueryIterator<dynamic>(
            query,
            requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey("job") });

        var results = new List<dynamic>();
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync(cancellationToken);
            results.AddRange(response);
        }

        return Ok(results);
    }
}
