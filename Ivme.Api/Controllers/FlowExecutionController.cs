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
}
