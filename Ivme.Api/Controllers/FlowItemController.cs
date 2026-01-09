using Ivme.Api.Models;
using Ivme.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/flow-items")]
[Authorize]
public class FlowItemController : ControllerBase
{
    private readonly IFlowItemService _flowService;
    private readonly IPermissionService _permissionService;
    private readonly IUserService _userService;

    public FlowItemController(
        IFlowItemService flowService,
        IPermissionService permissionService,
        IUserService userService)
    {
        _flowService = flowService;
        _permissionService = permissionService;
        _userService = userService;
    }

    [HttpGet]
    public async Task<ActionResult<List<FlowItem>>> GetAll()
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.flow.view");
        if (!hasPermission) return Forbid();

        var flows = await _flowService.GetAllFlowsAsync();
        return Ok(flows);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<FlowItem>> GetById(string id)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.flow.view");
        if (!hasPermission) return Forbid();

        var flow = await _flowService.GetFlowByIdAsync(id);
        if (flow == null) return NotFound();
        return Ok(flow);
    }

    [HttpPost]
    public async Task<ActionResult<FlowItem>> Create(FlowItem flow)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.flow.create");
        if (!hasPermission) return Forbid();

        var created = await _flowService.CreateFlowAsync(flow);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<FlowItem>> Update(string id, FlowItem flow)
    {
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.flow.update");
        if (!hasPermission) return Forbid();

        if (id != flow.Id) return BadRequest();
        try
        {
            var updated = await _flowService.UpdateFlowAsync(flow);
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
        var hasPermission = await _permissionService.HasPermissionAsync(User.Identity?.Name, "pages.flow.delete");
        if (!hasPermission) return Forbid();

        var result = await _flowService.DeleteFlowAsync(id);
        if (!result) return NotFound();
        return NoContent();
    }
}
