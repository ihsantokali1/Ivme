using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IJwtService _jwtService;

    public AuthController(IUserService userService, IJwtService jwtService)
    {
        _userService = userService;
        _jwtService = jwtService;
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Kullanıcı adı ve şifre gereklidir" });
        }

        var user = await _userService.GetUserByUsernameAsync(request.Username);
        if (user == null)
        {
            Console.WriteLine($"[AUTH] Login failed: User '{request.Username}' not found");
            return Unauthorized(new { message = "Kullanıcı adı veya şifre hatalı" });
        }

        var isValidPassword = _userService.ValidatePassword(request.Password, user.PasswordHash);
        if (!isValidPassword)
        {
            Console.WriteLine($"[AUTH] Login failed: Invalid password for user '{request.Username}'");
            return Unauthorized(new { message = "Kullanıcı adı veya şifre hatalı" });
        }

        var token = _jwtService.GenerateToken(user.Id, user.Username, user.Role.ToString());
        Console.WriteLine($"[AUTH] Login successful: User '{request.Username}' (Role: {user.Role})");

        return Ok(new LoginResponse
        {
            Token = token,
            User = new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                Role = user.Role.ToString()
            }
        });
    }

    [HttpPost("register")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserDto>> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Kullanıcı adı ve şifre gereklidir" });
        }

        var existingUser = await _userService.GetUserByUsernameAsync(request.Username);
        if (existingUser != null)
        {
            return BadRequest(new { message = "Bu kullanıcı adı zaten kullanılıyor" });
        }

        try
        {
            var user = await _userService.CreateUserAsync(
                request.Username,
                request.Password,
                request.Email ?? string.Empty,
                request.Role ?? "User"
            );

            return Ok(new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                Role = user.Role
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Kullanıcı oluşturulurken hata: {ex.Message}" });
        }
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> GetCurrentUser()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var user = await _userService.GetUserByIdAsync(userId);
        if (user == null)
        {
            return NotFound(new { message = "Kullanıcı bulunamadı" });
        }

        return Ok(new UserDto
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            Role = user.Role
        });
    }

    [HttpGet("users")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<UserDto>>> GetAllUsers()
    {
        var users = await _userService.GetAllUsersAsync();
        var userDtos = users.Select(u => new UserDto
        {
            Id = u.Id,
            Username = u.Username,
            Email = u.Email,
            Role = u.Role,
            IsActive = u.IsActive,
            CreatedAt = u.CreatedAt
        }).ToList();

        return Ok(userDtos);
    }

    [HttpPut("users/{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserDto>> UpdateUser(string userId, [FromBody] UpdateUserRequest request)
    {
        try
        {
            var user = await _userService.UpdateUserAsync(userId, request.Email, request.Role, request.IsActive);
            
            return Ok(new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                Role = user.Role,
                IsActive = user.IsActive,
                CreatedAt = user.CreatedAt
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("users/{userId}/password")]
    [Authorize]
    public async Task<ActionResult> UpdateUserPassword(string userId, [FromBody] UpdatePasswordRequest request)
    {
        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var isAdmin = User.IsInRole("Admin");

        // Sadece admin veya kendi şifresini değiştirebilir
        if (!isAdmin && currentUserId != userId)
        {
            return Forbid();
        }

        try
        {
            var success = await _userService.UpdateUserPasswordAsync(userId, request.NewPassword);
            if (!success)
            {
                return NotFound(new { message = "Kullanıcı bulunamadı" });
            }

            return Ok(new { message = "Şifre başarıyla güncellendi" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("users/{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult> DeleteUser(string userId)
    {
        try
        {
            var success = await _userService.DeleteUserAsync(userId);
            if (!success)
            {
                return NotFound(new { message = "Kullanıcı bulunamadı" });
            }

            return Ok(new { message = "Kullanıcı başarıyla silindi" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}

// DTOs
public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public UserDto User { get; set; } = null!;
}

public class RegisterRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Role { get; set; }
}

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

public class UpdateUserRequest
{
    public string? Email { get; set; }
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
}

public class UpdatePasswordRequest
{
    public string NewPassword { get; set; } = string.Empty;
}

