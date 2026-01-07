using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ExecutionHistoryController : ControllerBase
{
    private readonly IExecutionHistoryService _executionHistoryService;

    public ExecutionHistoryController(IExecutionHistoryService executionHistoryService)
    {
        _executionHistoryService = executionHistoryService;
    }

    [HttpGet("tasks")]
    public async Task<ActionResult<List<TaskExecutionHistory>>> GetTaskExecutionHistories(
        [FromQuery] string? taskItemId = null,
        [FromQuery] string? groupId = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var histories = await _executionHistoryService.GetTaskExecutionHistoriesAsync(taskItemId, groupId, startDate, endDate);
        return Ok(histories);
    }

    [HttpGet("groups")]
    public async Task<ActionResult<List<GroupExecutionHistory>>> GetGroupExecutionHistories(
        [FromQuery] string? groupId = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var histories = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId, startDate, endDate);
        return Ok(histories);
    }

    [HttpGet("tasks/{id}")]
    public async Task<ActionResult<TaskExecutionHistory>> GetTaskExecutionHistory(string id)
    {
        var history = await _executionHistoryService.GetTaskExecutionHistoryAsync(id);
        if (history == null)
        {
            return NotFound();
        }
        return Ok(history);
    }

    [HttpGet("groups/{id}")]
    public async Task<ActionResult<GroupExecutionHistory>> GetGroupExecutionHistory(string id)
    {
        var history = await _executionHistoryService.GetGroupExecutionHistoryAsync(id);
        if (history == null)
        {
            return NotFound();
        }
        return Ok(history);
    }

    [HttpGet("today-statuses")]
    public async Task<ActionResult<Dictionary<string, string>>> GetTodayTaskStatuses()
    {
        var statuses = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync();
        // Dictionary<string, TaskItemStatus> -> Dictionary<string, string> dönüşümü
        var result = statuses.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.ToString());
        return Ok(result);
    }

    [HttpGet("today-statuses-with-errors")]
    public async Task<ActionResult<Dictionary<string, object>>> GetTodayTaskStatusesWithErrors()
    {
        var statusesWithErrors = await _executionHistoryService.GetTodayTaskStatusesWithErrorsByGroupAsync();
        // Dictionary<string, (TaskItemStatus Status, string? ErrorMessage)> -> Dictionary<string, object> dönüşümü
        var result = statusesWithErrors.ToDictionary(
            kvp => kvp.Key, 
            kvp => new { status = kvp.Value.Status.ToString(), errorMessage = kvp.Value.ErrorMessage }
        );
        return Ok(result);
    }
}

