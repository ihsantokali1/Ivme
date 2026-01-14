using Ivme.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/flow-execution")]
public class FlowExecutionController : ControllerBase
{
    private readonly ITaskManagementService _taskManagementService;

    public FlowExecutionController(ITaskManagementService taskManagementService)
    {
        _taskManagementService = taskManagementService;
    }

    [HttpPost("{flowId}/start")]
    public async Task<IActionResult> StartFlow(string flowId, [FromQuery] string triggeredBy = "Manual")
    {
        var result = await _taskManagementService.StartFlowAsync(flowId, triggeredBy);
        if (result)
        {
            return Ok(new { message = "Flow started successfully" });
        }
        return BadRequest(new { message = "Failed to start flow" });
    }

    [HttpPost("{flowId}/stop")]
    public async Task<IActionResult> StopFlow(string flowId)
    {
        // TODO: Implement StopFlowAsync in TaskManagementService if needed
        return Ok(new { message = "Flow stop requested" });
    }

    [HttpPost("{flowId}/resume")]
    public async Task<IActionResult> ResumeFlow(string flowId)
    {
        // TODO: Implement ResumeFlowAsync in TaskManagementService if needed
        return Ok(new { message = "Flow resume requested" });
    }

    [HttpPost("groups/{groupId}/mark-as-success/{flowExecutionId}")]
    public async Task<IActionResult> MarkGroupAsSuccess(string groupId, string flowExecutionId)
    {
        var result = await _taskManagementService.MarkGroupAsSuccessAsync(groupId, flowExecutionId);
        if (result) return Ok(new { message = "Group marked as success" });
        return BadRequest(new { message = "Failed to mark group as success" });
    }

    [HttpPost("groups/{groupId}/stop/{flowExecutionId}")]
    public async Task<IActionResult> StopGroup(string groupId, string flowExecutionId)
    {
        var result = await _taskManagementService.StopGroupAsync(groupId, flowExecutionId);
        if (result) return Ok(new { message = "Group stopped" });
        return BadRequest(new { message = "Failed to stop group" });
    }

    [HttpPost("groups/{groupId}/pause/{flowExecutionId}")]
    public async Task<IActionResult> PauseGroup(string groupId, string flowExecutionId)
    {
        var result = await _taskManagementService.PauseGroupAsync(groupId, flowExecutionId);
        if (result) return Ok(new { message = "Group paused" });
        return BadRequest(new { message = "Failed to pause group" });
    }

    [HttpPost("groups/{groupId}/resume/{flowExecutionId}")]
    public async Task<IActionResult> ResumeGroup(string groupId, string flowExecutionId)
    {
        var result = await _taskManagementService.ResumeGroupAsync(groupId, flowExecutionId);
        if (result) return Ok(new { message = "Group resumed" });
        return BadRequest(new { message = "Failed to resume group" });
    }

    [HttpPost("groups/{groupId}/restart/{flowId}/{flowExecutionId}")]
    public async Task<IActionResult> RestartGroup(string groupId, string flowId, string flowExecutionId)
    {
        var result = await _taskManagementService.RestartGroupInFlowAsync(groupId, flowId, flowExecutionId);
        if (result) return Ok(new { message = "Group restarted" });
        return BadRequest(new { message = "Failed to restart group" });
    }
}
