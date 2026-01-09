using Ivme.Api.Models;
using Ivme.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/flow-group-assignments")]
[Authorize]
public class FlowGroupAssignmentController : ControllerBase
{
    private readonly IFlowGroupAssignmentService _assignmentService;
    private readonly IPermissionService _permissionService;

    public FlowGroupAssignmentController(
        IFlowGroupAssignmentService assignmentService,
        IPermissionService permissionService)
    {
        _assignmentService = assignmentService;
        _permissionService = permissionService;
    }

    [HttpGet("flow/{flowItemId}")]
    public async Task<ActionResult<List<FlowGroupAssignment>>> GetByFlow(string flowItemId)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.configuration.view");
        if (!hasPermission) return Forbid();

        var assignments = await _assignmentService.GetAssignmentsByFlowAsync(flowItemId);
        return Ok(assignments);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<FlowGroupAssignment>> GetById(string id)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.configuration.view");
        if (!hasPermission) return Forbid();

        var assignment = await _assignmentService.GetAssignmentByIdAsync(id);
        if (assignment == null) return NotFound();
        return Ok(assignment);
    }

    [HttpPost]
    public async Task<ActionResult<FlowGroupAssignment>> Create(FlowGroupAssignment assignment)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.configuration.update");
        if (!hasPermission) return Forbid();

        try
        {
            var created = await _assignmentService.CreateAssignmentAsync(assignment);
            return Ok(created); // Return Ok to avoid potential CreatedAtAction routing issues
        }
        catch (Exception ex)
        {
            var errorMsg = ex.InnerException != null ? $"{ex.Message} Inner: {ex.InnerException.Message}" : ex.Message;
            return BadRequest(new { error = errorMsg });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<FlowGroupAssignment>> Update(string id, FlowGroupAssignment assignment)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.configuration.update");
        if (!hasPermission) return Forbid();

        if (id != assignment.Id) return BadRequest();
        try
        {
            var updated = await _assignmentService.UpdateAssignmentAsync(assignment);
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.configuration.update");
        if (!hasPermission) return Forbid();

        var result = await _assignmentService.DeleteAssignmentAsync(id);
        if (!result) return NotFound();
        return NoContent();
    }
}
