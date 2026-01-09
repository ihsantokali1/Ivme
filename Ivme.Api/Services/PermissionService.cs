using Microsoft.EntityFrameworkCore;
using Ivme.Api.Data;
using Ivme.Api.Models;

namespace Ivme.Api.Services;

public class PermissionService : IPermissionService
{
    private readonly TaskDbContext? _dbContext;
    private readonly DatabaseConfig _dbConfig;

    public PermissionService(TaskDbContext? dbContext, DatabaseConfig dbConfig)
    {
        _dbContext = dbContext;
        _dbConfig = dbConfig;
    }

    public async Task<List<string>> GetPermissionsByRoleAsync(string role)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            return GetDefaultPermissions(role);
        }

        var permissions = await _dbContext.RolePermissions
            .Where(rp => rp.Role == role)
            .Select(rp => rp.Permission)
            .ToListAsync();

        // Eğer veritabanında yetki yoksa varsayılan yetkileri döndür
        if (permissions.Count == 0)
        {
            permissions = GetDefaultPermissions(role);
        }

        return permissions;
    }

    public async Task<Dictionary<string, List<string>>> GetAllRolePermissionsAsync()
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            return new Dictionary<string, List<string>>
            {
                { "Admin", GetDefaultPermissions("Admin") },
                { "User", GetDefaultPermissions("User") }
            };
        }

        var allPermissions = await _dbContext.RolePermissions.ToListAsync();
        
        // Tüm rolleri grupla
        var result = allPermissions
            .GroupBy(rp => rp.Role)
            .ToDictionary(
                g => g.Key,
                g => g.Select(rp => rp.Permission).ToList()
            );

        return result;
    }

    public async Task UpdateRolePermissionsAsync(string role, List<string> permissions)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            throw new InvalidOperationException("Database mode is not enabled");
        }

        // Mevcut yetkileri sil
        var existingPermissions = await _dbContext.RolePermissions
            .Where(rp => rp.Role == role)
            .ToListAsync();
        
        _dbContext.RolePermissions.RemoveRange(existingPermissions);

        // Yeni yetkileri ekle
        foreach (var permission in permissions)
        {
            _dbContext.RolePermissions.Add(new RolePermission
            {
                Role = role,
                Permission = permission,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            });
        }

        await _dbContext.SaveChangesAsync();
    }

    public async Task InitializeDefaultPermissionsAsync()
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            return;
        }

        // Sadece Admin ve User rolleri için varsayılan yetkileri oluştur (eksik olanları ekle)
        var defaultRoles = new[] { "Admin", "User" };
        foreach (var roleName in defaultRoles)
        {
            var defaultPermissions = GetDefaultPermissions(roleName);
            
            // Mevcut yetkileri al
            var existingPermissions = await _dbContext.RolePermissions
                .Where(rp => rp.Role == roleName)
                .Select(rp => rp.Permission)
                .ToListAsync();
                
            // Eksik olanları ekle
            foreach (var permission in defaultPermissions)
            {
                if (!existingPermissions.Contains(permission))
                {
                    _dbContext.RolePermissions.Add(new RolePermission
                    {
                        Role = roleName,
                        Permission = permission,
                        CreatedAt = DateTime.Now,
                        UpdatedAt = DateTime.Now
                    });
                }
            }
        }

        await _dbContext.SaveChangesAsync();
    }

    public async Task<bool> HasPermissionAsync(string? username, string permission)
    {
        if (string.IsNullOrEmpty(username)) return false;

        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            // Database yoksa, username "admin" ise Admin rolü, değilse User rolü varsayalım (basitleştirilmiş)
            // Gerçek senaryoda user servisine gidip rolü almak gerekebilir ama burada db yoksa zaten user da yok
            return false;
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) return false;

        var rolePermissions = await GetPermissionsByRoleAsync(user.Role);
        return rolePermissions.Contains(permission);
    }

    private List<string> GetDefaultPermissions(string role)
    {
        return role switch
        {
            "Admin" => new List<string>
            {
                "pages.dashboard.view",
                "pages.tasks.view", "pages.tasks.create", "pages.tasks.update", "pages.tasks.delete",
                "pages.groups.view", "pages.groups.create", "pages.groups.update", "pages.groups.delete",
                "pages.configuration.view", "pages.configuration.update",
                "pages.schedule.view", "pages.schedule.update",
                "pages.management.view", "pages.history.view", "pages.tv.view",
                "pages.users.view", "pages.users.create", "pages.users.update", "pages.users.delete",
                "pages.flow.view", "pages.flow.create", "pages.flow.update", "pages.flow.delete",
                "actions.task.start", "actions.task.stop", "actions.task.pause", "actions.task.resume",
                "actions.task.complete", "actions.task.markAsSuccess", "actions.task.fail", "actions.task.restart",
                "actions.group.start", "actions.group.stop"
            },
            "User" => new List<string>
            {
                "pages.dashboard.view",
                "pages.tasks.view", "pages.groups.view", "pages.configuration.view",
                "pages.schedule.view", "pages.management.view", "pages.history.view", "pages.tv.view",
                "pages.flow.view",
                "actions.task.start", "actions.task.stop", "actions.task.pause", "actions.task.resume",
                "actions.task.complete", "actions.task.markAsSuccess", "actions.task.fail", "actions.task.restart",
                "actions.group.start", "actions.group.stop"
            },
            _ => new List<string>()
        };
    }
}

