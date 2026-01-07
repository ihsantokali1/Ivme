using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Tüm endpoint'ler için authentication gerekli
public class PermissionController : ControllerBase
{
    private readonly IPermissionService _permissionService;

    public PermissionController(IPermissionService permissionService)
    {
        _permissionService = permissionService;
    }

    [HttpGet("roles/{role}")]
    public async Task<ActionResult<List<string>>> GetPermissionsByRole(string role)
    {
        var permissions = await _permissionService.GetPermissionsByRoleAsync(role);
        return Ok(permissions);
    }

    [HttpGet("roles")]
    public async Task<ActionResult<Dictionary<string, List<string>>>> GetAllRolePermissions()
    {
        var allPermissions = await _permissionService.GetAllRolePermissionsAsync();
        return Ok(allPermissions);
    }

    [HttpPut("roles/{role}")]
    [Authorize(Roles = "Admin")] // Sadece Admin güncelleyebilir
    public async Task<ActionResult> UpdateRolePermissions(string role, [FromBody] UpdateRolePermissionsRequest request)
    {
        try
        {
            await _permissionService.UpdateRolePermissionsAsync(role, request.Permissions);
            return Ok(new { message = "Yetkiler başarıyla güncellendi" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("initialize")]
    [Authorize(Roles = "Admin")] // Sadece Admin initialize edebilir
    public async Task<ActionResult> InitializeDefaultPermissions()
    {
        try
        {
            await _permissionService.InitializeDefaultPermissionsAsync();
            return Ok(new { message = "Varsayılan yetkiler başarıyla oluşturuldu" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Hata: {ex.Message}" });
        }
    }
}

public class UpdateRolePermissionsRequest
{
    public List<string> Permissions { get; set; } = new();
}

