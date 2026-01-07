using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IPermissionService
{
    Task<List<string>> GetPermissionsByRoleAsync(string role);
    Task<Dictionary<string, List<string>>> GetAllRolePermissionsAsync();
    Task UpdateRolePermissionsAsync(string role, List<string> permissions);
    Task InitializeDefaultPermissionsAsync();
}

