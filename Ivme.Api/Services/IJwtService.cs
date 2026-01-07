using System.Security.Claims;

namespace Ivme.Api.Services;

public interface IJwtService
{
    string GenerateToken(string userId, string username, string role);
    ClaimsPrincipal? ValidateToken(string token);
}

