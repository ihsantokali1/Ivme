using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IRoleService
{
    Task<List<Role>> GetAllRolesAsync();
    Task<Role?> GetRoleByIdAsync(string id);
    Task<Role?> GetRoleByNameAsync(string name);
    Task<Role> CreateRoleAsync(Role role);
    Task<Role> UpdateRoleAsync(string id, Role role);
    Task<bool> DeleteRoleAsync(string id);
    Task<bool> IsRoleInUseAsync(string roleName);
}

