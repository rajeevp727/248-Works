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
        _auth = auth;
    }

    [HttpPost]
    public async Task<ActionResult<Application>> Create(
        [FromBody] Application application,
        CancellationToken cancellationToken)
    {
        var user = await _auth.GetUserAsync(Request, cancellationToken);
        if (user is null) return Unauthorized(new { message = "Please sign in as a job seeker." });
        if (!string.Equals(user.role, "JobSeeker", StringComparison.OrdinalIgnoreCase)) return Forbid();

        if (string.IsNullOrWhiteSpace(application.jobId))
            return BadRequest("Job is required.");

        application.candidateId = user.id;
        application.candidateName = string.IsNullOrWhiteSpace(user.name) ? user.email : user.name;

        return Ok(await _repository.CreateApplicationAsync(application, cancellationToken));
    }
}
