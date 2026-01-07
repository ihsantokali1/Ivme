using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;
using Ivme.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TasksController : ControllerBase
{
    private readonly ITaskDataService _dataService;
    private readonly ITaskManagementService _managementService;
    private readonly IExecutionHistoryService _executionHistoryService;
    private readonly TaskDbContext? _dbContext;

    public TasksController(ITaskDataService dataService, ITaskManagementService managementService, IExecutionHistoryService executionHistoryService, TaskDbContext? dbContext = null)
    {
        _dataService = dataService;
        _managementService = managementService;
        _executionHistoryService = executionHistoryService;
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<TaskItem>>> GetAllTaskItems()
    {
        var data = await _dataService.GetDataAsync();
        var taskItems = data.TaskItems;
        
        // TaskItem'ları parametreleriyle birlikte getir
        if (_dbContext != null)
        {
            foreach (var taskItem in taskItems)
            {
                taskItem.Parameters = await _dbContext.TaskParameters
                    .Where(p => p.TaskItemId == taskItem.Id)
                    .OrderBy(p => p.Order)
                    .ToListAsync();
            }
        }
        
        return Ok(taskItems);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<TaskItem>> GetTaskItem(string id)
    {
        var taskItem = await _dataService.GetTaskItemAsync(id);
        if (taskItem == null)
        {
            return NotFound();
        }
        return Ok(taskItem);
    }

    [HttpPost]
    public async Task<ActionResult<TaskItem>> CreateTaskItem([FromBody] TaskItem taskItem)
    {
        var created = await _dataService.CreateTaskItemAsync(taskItem);
        
        // Task item oluşturulduktan sonra durum kontrolü yap
        await _managementService.CheckAndUpdateTaskItemStatusesAsync();
        
        return CreatedAtAction(nameof(GetTaskItem), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<TaskItem>> UpdateTaskItem(string id, [FromBody] TaskItem taskItem)
    {
        if (id != taskItem.Id)
        {
            return BadRequest("ID mismatch");
        }

        try
        {
            var updated = await _dataService.UpdateTaskItemAsync(taskItem);
            
            // Task item güncellendikten sonra durum kontrolü yap
            await _managementService.CheckAndUpdateTaskItemStatusesAsync();
            
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteTaskItem(string id)
    {
        var deleted = await _dataService.DeleteTaskItemAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        return NoContent();
    }

    [HttpPost("{id}/start")]
    public async Task<ActionResult> StartTaskItem(string id)
    {
        var (canStart, reason) = await _managementService.CanStartTaskItemWithReasonAsync(id);
        if (!canStart)
        {
            return BadRequest(reason ?? "Task item cannot be started. Check prerequisites or current status.");
        }
        
        // Kullanıcı ID'sini al
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var triggeredBy = userId ?? "Manual";

        var success = await _managementService.StartTaskItemAsync(id, triggeredBy: triggeredBy);
        if (!success)
        {
            return BadRequest("Task item başlatılamadı.");
        }
        return Ok(new { message = "Task item started successfully" });
    }

    [HttpPost("{id}/pause")]
    public async Task<ActionResult> PauseTaskItem(string id)
    {
        var success = await _managementService.PauseTaskItemAsync(id);
        if (!success)
        {
            return BadRequest("Task item cannot be paused. Task item must be running.");
        }
        return Ok(new { message = "Task item paused successfully" });
    }

    [HttpPost("{id}/resume")]
    public async Task<ActionResult> ResumeTaskItem(string id)
    {
        var success = await _managementService.ResumeTaskItemAsync(id);
        if (!success)
        {
            return BadRequest("Task item cannot be resumed. Check prerequisites or current status.");
        }
        return Ok(new { message = "Task item resumed successfully" });
    }

    [HttpPost("{id}/stop")]
    public async Task<ActionResult> StopTaskItem(string id)
    {
        var success = await _managementService.StopTaskItemAsync(id);
        if (!success)
        {
            return BadRequest("Task item cannot be stopped.");
        }
        return Ok(new { message = "Task item stopped successfully" });
    }

    [HttpPost("{id}/complete")]
    public async Task<ActionResult> CompleteTaskItem(string id)
    {
        var success = await _managementService.CompleteTaskItemAsync(id);
        if (!success)
        {
            return BadRequest("Task item cannot be completed.");
        }
        return Ok(new { message = "Task item completed successfully" });
    }

    [HttpPost("{id}/mark-as-success")]
    public async Task<ActionResult> MarkTaskAsSuccess(string id, [FromQuery] string? groupExecutionId = null, [FromQuery] string? groupId = null)
    {
        try
        {
            // Logları hem console'a hem de response'a ekle (debug için)
            var logMessages = new List<string>();
            logMessages.Add($"[TasksController] MarkTaskAsSuccess called for taskId: {id}, groupId: {groupId ?? "null"}, groupExecutionId: {groupExecutionId ?? "null"}");
            
            System.Diagnostics.Debug.WriteLine($"[TasksController] MarkTaskAsSuccess called for taskId: {id}, groupId: {groupId ?? "null"}, groupExecutionId: {groupExecutionId ?? "null"}");
            Console.WriteLine($"[TasksController] MarkTaskAsSuccess called for taskId: {id}, groupId: {groupId ?? "null"}, groupExecutionId: {groupExecutionId ?? "null"}");
            System.Console.Out.Flush();
            
            var success = await _managementService.MarkTaskAsSuccessAsync(id, groupId, logMessages, groupExecutionId);
            
            logMessages.Add($"[TasksController] MarkTaskAsSuccessAsync returned: {success}");
            System.Diagnostics.Debug.WriteLine($"[TasksController] MarkTaskAsSuccessAsync returned: {success}");
            Console.WriteLine($"[TasksController] MarkTaskAsSuccessAsync returned: {success}");
            System.Console.Out.Flush();
            
            if (!success)
            {
                return BadRequest(new { message = "Task item cannot be marked as success.", logs = logMessages });
            }
            return Ok(new { message = "Task item marked as success successfully", logs = logMessages });
        }
        catch (Exception ex)
        {
            var errorLog = $"[TasksController] Exception in MarkTaskAsSuccess: {ex.Message}";
            System.Diagnostics.Debug.WriteLine(errorLog);
            Console.WriteLine(errorLog);
            Console.WriteLine($"[TasksController] StackTrace: {ex.StackTrace}");
            System.Console.Out.Flush();
            return StatusCode(500, new { message = $"Error: {ex.Message}", error = ex.ToString() });
        }
    }

    [HttpPost("{id}/fail")]
    public async Task<ActionResult> FailTaskItem(string id, [FromBody] FailTaskItemRequest request)
    {
        var success = await _managementService.FailTaskItemAsync(id, request.ErrorMessage);
        if (!success)
        {
            return BadRequest("Task item cannot be failed.");
        }
        return Ok(new { message = "Task item marked as failed" });
    }

    [HttpPut("{id}/progress")]
    public async Task<ActionResult> UpdateProgress(string id, [FromBody] UpdateProgressRequest request)
    {
        await _managementService.UpdateTaskItemProgressAsync(id, request.Progress);
        return Ok(new { message = "Progress updated successfully" });
    }

    [HttpGet("ready")]
    public async Task<ActionResult<List<TaskItem>>> GetReadyTaskItems()
    {
        var readyTaskItems = await _managementService.GetReadyTaskItemsAsync();
        return Ok(readyTaskItems);
    }

    [HttpPost("check-statuses")]
    public async Task<ActionResult> CheckStatuses()
    {
        await _managementService.CheckAndUpdateTaskItemStatusesAsync();
        return Ok(new { message = "Task item statuses checked and updated" });
    }

    [HttpPost("{id}/restart")]
    public async Task<ActionResult> RestartTaskItem(string id, [FromQuery] string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(id);
        if (taskItem == null)
        {
            return NotFound("Task item not found");
        }

        // Mevcut durumu kontrol et ve groupId'yi bul
        var data = await _dataService.GetDataAsync();
        
        // GroupId belirtilmemişse, assignment'tan bul
        if (string.IsNullOrEmpty(groupId))
        {
            var assignmentForGroupId = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == id);
            if (assignmentForGroupId != null)
            {
                groupId = assignmentForGroupId.GroupId;
            }
        }

        // Mevcut durumu kontrol et - TaskExecutionHistory'den bugünün statüsünü al
        var assignment = !string.IsNullOrEmpty(groupId) 
            ? data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == id && a.GroupId == groupId)
            : data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == id);
        
        TaskItemStatus? currentStatus = assignment?.Status;
        
        // Eğer assignment'tan statü alınamadıysa, TaskExecutionHistory'den bugünün statüsünü al
        if (!currentStatus.HasValue)
        {
            var historyService = _executionHistoryService as ExecutionHistoryService;
            if (historyService != null)
            {
                var dbContext = historyService.GetDbContextPublic();
                if (dbContext != null)
                {
                    var today = DateTime.UtcNow.Date;
                    var todayExecution = await dbContext.TaskExecutionHistories
                        .Where(e => e.TaskItemId == id && 
                                   (string.IsNullOrEmpty(groupId) || e.GroupId == groupId) &&
                                   e.StartTime.Date == today)
                        .OrderByDescending(e => e.StartTime)
                        .FirstOrDefaultAsync();
                    
                    if (todayExecution != null)
                    {
                        currentStatus = todayExecution.FinalStatus;
                    }
                }
            }
        }
        
        // Eğer hala statü yoksa, Pending olarak kabul et
        if (!currentStatus.HasValue)
        {
            currentStatus = TaskItemStatus.Pending;
        }

        // Kullanıcı ID'sini al
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var triggeredBy = userId ?? "Manual";

        var success = await _managementService.RestartTaskItemAsync(id, groupId, triggeredBy);
        if (!success)
        {
            if (currentStatus.Value == TaskItemStatus.Running)
            {
                return BadRequest("Task item cannot be restarted while it is running. Please stop it first.");
            }
            
            // Daha detaylı hata mesajı
            if (assignment == null && !string.IsNullOrEmpty(groupId))
            {
                return BadRequest($"Task item cannot be restarted. Assignment not found for group: {groupId}");
            }
            
            return BadRequest($"Task item cannot be restarted. Current status: {currentStatus}. " +
                            $"Please ensure the task is in a restartable state (Pending, Completed, Failed, Paused, or WaitingRetry).");
        }
        return Ok(new { message = "Task item restarted successfully" });
    }

}

public class FailTaskItemRequest
{
    public string ErrorMessage { get; set; } = string.Empty;
}

public class UpdateProgressRequest
{
    public int Progress { get; set; }
}

