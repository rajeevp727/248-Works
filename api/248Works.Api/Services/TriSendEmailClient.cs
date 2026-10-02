using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using _248Works.Api.Models;

namespace _248Works.Api.Services;

public sealed class TriSendEmailClient
{
    private readonly HttpClient _http;
    private readonly TriSendOptions _options;

    public TriSendEmailClient(HttpClient http, IOptions<TriSendOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public async Task SendOtpAsync(string recipient, string code, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.BaseUrl) || string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new InvalidOperationException("TriSend email configuration is missing.");

        var endpoint = _options.BaseUrl.TrimEnd('/') + "/v1/messages";
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);

        var payload = new
        {
            channel = "email",
            recipient,
            subject = "Your 248 Works verification code",
            body = $"Your 248 Works verification code is {code}. It expires in 10 minutes. If you did not request this code, you can ignore this email."
        };

        request.Content = JsonContent.Create(payload);

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException($"TriSend rejected the email: {(int)response.StatusCode} {body}");
        }
    }
}
