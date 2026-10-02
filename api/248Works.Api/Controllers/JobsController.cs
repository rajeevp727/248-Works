using Microsoft.AspNetCore.Mvc;
using _248Works.Api.Models;
using _248Works.Api.Services;

namespace _248Works.Api.Controllers;

[ApiController]
[Route("api/jobs")]
public sealed class JobsController : ControllerBase
{
    private const string LaunchState = "Telangana";
    private static readonly HashSet<string> TelanganaLocations = new(StringComparer.OrdinalIgnoreCase)
    {
        "Hyderabad", "Nizampet", "Bachupally", "Kukatpally", "Pragathi Nagar",
        "Miyapur", "Gachibowli", "Madhapur", "Secunderabad", "Medchal",
        "Malkajgiri", "LB Nagar", "Uppal", "Kompally", "Shamshabad",
        "Sangareddy", "Warangal", "Karimnagar", "Nizamabad", "Khammam", "Nalgonda"
    };

    private readonly CosmosRepository _repository;
    private readonly AuthContext _auth;

    public JobsController(CosmosRepository repository, AuthContext auth)
    {
        _repository = repository;
        _auth = auth;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Job>>> Get(CancellationToken cancellationToken)
    {
        return Ok(await _repository.GetJobsAsync(cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<Job>> Create(
        [FromBody] Job job,
        CancellationToken cancellationToken)
    {
        var user = await _auth.GetUserAsync(Request, cancellationToken);
        if (user is null) return Unauthorized(new { message = "Please sign in." });
        if (!string.Equals(user.role, "Employer", StringComparison.OrdinalIgnoreCase) && !string.Equals(user.role, "Admin", StringComparison.OrdinalIgnoreCase)) return Forbid();

        if (string.IsNullOrWhiteSpace(job.title) || string.IsNullOrWhiteSpace(job.company))
            return BadRequest("Job title and company are required.");

        if (!TelanganaLocations.Contains(job.location))
            return BadRequest("248 Works currently accepts job locations only within Telangana.");

        job.state = LaunchState;

        return Ok(await _repository.CreateJobAsync(job, cancellationToken));
    }
}
