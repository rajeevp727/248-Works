using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using _248Works.Api.Models;
using _248Works.Api.Services;

namespace _248Works.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly CosmosRepository _repository;
    private readonly TriSendEmailClient _emailClient;

    public AuthController(CosmosRepository repository, TriSendEmailClient emailClient)
    {
        _repository = repository;
        _emailClient = emailClient;
    }

    [HttpPost("request-code")]
    public async Task<IActionResult> RequestCode(
        [FromBody] RequestCodeRequest request,
        CancellationToken cancellationToken)
    {
        var email = NormalizeEmail(request.email);
        if (!IsValidEmail(email))
            return BadRequest(new { message = "Enter a valid email address." });

        var latest = await _repository.GetLatestOtpAsync(email, cancellationToken);
        if (latest is not null && latest.createdAt > DateTime.UtcNow.AddSeconds(-60))
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { message = "Please wait before requesting another code." });

        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var otp = new EmailOtp
        {
            normalizedEmail = email,
            codeHash = HashCode(email, code),
            expiresAt = DateTime.UtcNow.AddMinutes(10)
        };

        await _repository.SaveOtpAsync(otp, cancellationToken);
        await _emailClient.SendOtpAsync(email, code, cancellationToken);

        return Ok(new
        {
            message = "Verification code sent.",
            expiresInSeconds = 600
        });
    }

    [HttpPost("verify-code")]
    public async Task<IActionResult> VerifyCode(
        [FromBody] VerifyCodeRequest request,
        CancellationToken cancellationToken)
    {
        var email = NormalizeEmail(request.email);
        var code = request.code?.Trim() ?? "";

        if (!IsValidEmail(email) || code.Length != 6 || !code.All(char.IsDigit))
            return BadRequest(new { message = "Email and a 6-digit code are required." });

        var otp = await _repository.GetLatestOtpAsync(email, cancellationToken);
        if (otp is null || otp.consumed || otp.expiresAt <= DateTime.UtcNow)
            return Unauthorized(new { message = "The code is invalid or expired." });

        if (otp.attempts >= 5)
            return Unauthorized(new { message = "Too many attempts. Request a new code." });

        if (!CryptographicOperations.FixedTimeEquals(
                Convert.FromHexString(otp.codeHash),
                Convert.FromHexString(HashCode(email, code))))
        {
            otp.attempts++;
            return Unauthorized(new { message = "The code is invalid or expired." });
        }

        await _repository.ConsumeOtpAsync(otp, cancellationToken);

        var role = NormalizeRole(request.role);
        var user = await _repository.GetUserByEmailAsync(email, cancellationToken);

        if (user is null)
        {
            user = new User
            {
                email = email,
                normalizedEmail = email,
                role = role,
                name = request.name?.Trim() ?? "",
                phone = string.IsNullOrWhiteSpace(request.phone) ? null : request.phone.Trim(),
                location = string.IsNullOrWhiteSpace(request.location) ? null : request.location.Trim(),
                isEmailVerified = true,
                state = "Telangana"
            };
        }
        else
        {
            user.isEmailVerified = true;
            if (string.IsNullOrWhiteSpace(user.name) && !string.IsNullOrWhiteSpace(request.name))
                user.name = request.name.Trim();
            if (user.role != "Admin")
                user.role = role;
        }

        user = await _repository.UpsertUserAsync(user, cancellationToken);

        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var session = new AuthSession
        {
            userId = user.id,
            tokenHash = HashToken(rawToken),
            expiresAt = DateTime.UtcNow.AddDays(30)
        };

        await _repository.SaveSessionAsync(session, cancellationToken);

        return Ok(new
        {
            token = rawToken,
            user = new
            {
                id = user.id,
                email = user.email,
                role = user.role,
                name = user.name,
                location = user.location,
                state = user.state
            }
        });
    }

    private static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();

    private static bool IsValidEmail(string email) =>
        email.Length is >= 5 and <= 320 &&
        email.Contains('@') &&
        email.LastIndexOf('.') > email.IndexOf('@') + 1;

    private static string NormalizeRole(string? role) =>
        string.Equals(role, "Employer", StringComparison.OrdinalIgnoreCase)
            ? "Employer"
            : "JobSeeker";

    private static string HashCode(string email, string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"248works|otp|{email}|{code}")));

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"248works|session|{token}")));

    public sealed record RequestCodeRequest(string? email);
    public sealed record VerifyCodeRequest(string? email, string? code, string? role, string? name, string? phone, string? location);
}
