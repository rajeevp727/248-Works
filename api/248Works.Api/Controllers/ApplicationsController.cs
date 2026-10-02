using Microsoft.AspNetCore.Mvc;
using _248Works.Api.Models;
using _248Works.Api.Services;

namespace _248Works.Api.Controllers;

[ApiController]
[Route("api/applications")]
public sealed class ApplicationsController : ControllerBase
{
    private readonly CosmosRepository _repository;
    private readonly AuthContext _auth;

    public ApplicationsController(CosmosRepository repository, AuthContext auth)
    {
        _repository = repository;
    }

    [HttpPost]
    public async Task<ActionResult<Application>> Create(
        [FromBody] Application application,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(application.jobId) ||
            string.IsNullOrWhiteSpace(application.candidateId))
            return BadRequest("Job and candidate are required.");

        return Ok(await _repository.CreateApplicationAsync(application, cancellationToken));
    }
}
