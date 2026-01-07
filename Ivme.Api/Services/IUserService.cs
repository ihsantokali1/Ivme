using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IUserService
{
    Task<User?> GetUserByUsernameAsync(string username);
    Task<User?> GetUserByIdAsync(string userId);
    Task<List<User>> GetAllUsersAsync();
    Task<User> CreateUserAsync(string username, string password, string email, string role = "User");
    Task<User> UpdateUserAsync(string userId, string? email, string? role, bool? isActive);
    Task<bool> UpdateUserPasswordAsync(string userId, string newPassword);
    Task<bool> DeleteUserAsync(string userId);
    bool ValidatePassword(string password, string passwordHash);
    string HashPassword(string password);
}

