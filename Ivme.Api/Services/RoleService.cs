using Microsoft.EntityFrameworkCore;
using Ivme.Api.Data;
using Ivme.Api.Models;

namespace Ivme.Api.Services;

public class RoleService : IRoleService
{
    private readonly TaskDbContext _dbContext;

    public RoleService(TaskDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<Role>> GetAllRolesAsync()
    {
        return await _dbContext.Roles
            .OrderBy(r => r.Name)
            .ToListAsync();
    }

    public async Task<Role?> GetRoleByIdAsync(string id)
    {
        return await _dbContext.Roles.FindAsync(id);
    }

    public async Task<Role?> GetRoleByNameAsync(string name)
    {
        return await _dbContext.Roles
            .FirstOrDefaultAsync(r => r.Name == name);
    }

    public async Task<Role> CreateRoleAsync(Role role)
    {
        // Aynı isimde rol var mı kontrol et
        var existingRole = await GetRoleByNameAsync(role.Name);
        if (existingRole != null)
        {
            throw new InvalidOperationException($"'{role.Name}' adında bir rol zaten mevcut.");
        }

        role.Id = Guid.NewGuid().ToString();
        role.CreatedAt = DateTime.Now;
        role.UpdatedAt = DateTime.Now;

        _dbContext.Roles.Add(role);
        await _dbContext.SaveChangesAsync();

        return role;
    }

    public async Task<Role> UpdateRoleAsync(string id, Role role)
    {
        var existingRole = await GetRoleByIdAsync(id);
        if (existingRole == null)
        {
            throw new InvalidOperationException("Rol bulunamadı.");
        }

        // İsim değişiyorsa, yeni ismin benzersiz olduğunu kontrol et
        if (existingRole.Name != role.Name)
        {
            var roleWithSameName = await GetRoleByNameAsync(role.Name);
            if (roleWithSameName != null && roleWithSameName.Id != id)
            {
                throw new InvalidOperationException($"'{role.Name}' adında bir rol zaten mevcut.");
            }
        }

        existingRole.Name = role.Name;
        existingRole.Description = role.Description;
        existingRole.IsActive = role.IsActive;
        existingRole.UpdatedAt = DateTime.Now;

        await _dbContext.SaveChangesAsync();

        return existingRole;
    }

    public async Task<bool> DeleteRoleAsync(string id)
    {
        var role = await GetRoleByIdAsync(id);
        if (role == null)
        {
            return false;
        }

        // Rol kullanılıyor mu kontrol et
        if (await IsRoleInUseAsync(role.Name))
        {
            throw new InvalidOperationException($"'{role.Name}' rolü kullanılıyor. Önce bu rolü kullanan kullanıcıları güncelleyin.");
        }

        _dbContext.Roles.Remove(role);
        await _dbContext.SaveChangesAsync();

        return true;
    }

    public async Task<bool> IsRoleInUseAsync(string roleName)
    {
        return await _dbContext.Users.AnyAsync(u => u.Role == roleName);
    }
}

