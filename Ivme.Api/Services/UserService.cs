using Microsoft.EntityFrameworkCore;
using Ivme.Api.Data;
using Ivme.Api.Models;
using BCrypt.Net;

namespace Ivme.Api.Services;

public class UserService : IUserService
{
    private readonly TaskDbContext? _dbContext;
    private readonly DatabaseConfig _dbConfig;

    public UserService(TaskDbContext? dbContext, DatabaseConfig dbConfig)
    {
        _dbContext = dbContext;
        _dbConfig = dbConfig;
    }

    public async Task<User?> GetUserByUsernameAsync(string username)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            return null;
        }

        return await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Username == username && u.IsActive);
    }

    public async Task<User?> GetUserByIdAsync(string userId)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            return null;
        }

        return await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == userId);
    }

    public async Task<List<User>> GetAllUsersAsync()
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            return new List<User>();
        }

        return await _dbContext.Users
            .OrderBy(u => u.Username)
            .ToListAsync();
    }

    public async Task<User> CreateUserAsync(string username, string password, string email, string role = "User")
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            throw new InvalidOperationException("Database mode is not enabled");
        }

        var user = new User
        {
            Username = username,
            PasswordHash = HashPassword(password),
            Email = email,
            Role = role,
            IsActive = true,
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now
        };

        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync();

        return user;
    }

    public bool ValidatePassword(string password, string passwordHash)
    {
        return BCrypt.Net.BCrypt.Verify(password, passwordHash);
    }

    public async Task<User> UpdateUserAsync(string userId, string? email, string? role, bool? isActive)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            throw new InvalidOperationException("Database mode is not enabled");
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            throw new InvalidOperationException("User not found");
        }

        if (email != null)
        {
            user.Email = email;
        }

        if (role != null)
        {
            user.Role = role;
        }

        if (isActive.HasValue)
        {
            user.IsActive = isActive.Value;
        }

        user.UpdatedAt = DateTime.Now;
        await _dbContext.SaveChangesAsync();

        return user;
    }

    public async Task<bool> UpdateUserPasswordAsync(string userId, string newPassword)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            throw new InvalidOperationException("Database mode is not enabled");
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return false;
        }

        user.PasswordHash = HashPassword(newPassword);
        user.UpdatedAt = DateTime.Now;
        await _dbContext.SaveChangesAsync();

        return true;
    }

    public async Task<bool> DeleteUserAsync(string userId)
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
        {
            throw new InvalidOperationException("Database mode is not enabled");
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return false;
        }

        // Soft delete - sadece IsActive'i false yap
        user.IsActive = false;
        user.UpdatedAt = DateTime.Now;
        await _dbContext.SaveChangesAsync();

        return true;
    }

    public string HashPassword(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password);
    }
}

