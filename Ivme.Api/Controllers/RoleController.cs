using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class RoleController : ControllerBase
{
    private readonly IRoleService _roleService;

    public RoleController(IRoleService roleService)
    {
        _roleService = roleService;
    }

    [HttpGet]
    public async Task<ActionResult<List<Role>>> GetAllRoles()
    {
        var roles = await _roleService.GetAllRolesAsync();
        return Ok(roles);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Role>> GetRoleById(string id)
    {
        var role = await _roleService.GetRoleByIdAsync(id);
        if (role == null)
        {
            return NotFound(new { message = "Rol bulunamadı." });
        }
        return Ok(role);
    }

    [HttpPost]
    public async Task<ActionResult<Role>> CreateRole([FromBody] CreateRoleRequest request)
    {
        try
        {
            var role = new Role
            {
                Name = request.Name,
                Description = request.Description,
                IsActive = request.IsActive ?? true
            };

            var createdRole = await _roleService.CreateRoleAsync(role);
            return CreatedAtAction(nameof(GetRoleById), new { id = createdRole.Id }, createdRole);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Role>> UpdateRole(string id, [FromBody] UpdateRoleRequest request)
    {
        try
        {
            var role = new Role
            {
                Name = request.Name,
                Description = request.Description,
                IsActive = request.IsActive ?? true
            };

            var updatedRole = await _roleService.UpdateRoleAsync(id, role);
            return Ok(updatedRole);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteRole(string id)
    {
        try
        {
            var deleted = await _roleService.DeleteRoleAsync(id);
            if (!deleted)
            {
                return NotFound(new { message = "Rol bulunamadı." });
            }
            return Ok(new { message = "Rol başarıyla silindi." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}

public class CreateRoleRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool? IsActive { get; set; }
}

public class UpdateRoleRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool? IsActive { get; set; }
}

