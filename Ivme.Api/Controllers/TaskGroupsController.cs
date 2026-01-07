using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TaskGroupsController : ControllerBase
{
    private readonly ITaskDataService _dataService;
    private readonly ITaskManagementService _managementService;

    public TaskGroupsController(ITaskDataService dataService, ITaskManagementService managementService)
    {
        _dataService = dataService;
        _managementService = managementService;
    }

    [HttpGet]
    public async Task<ActionResult<List<TaskItemGroup>>> GetAllGroups()
    {
        var data = await _dataService.GetDataAsync();
        return Ok(data.Groups);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<TaskItemGroup>> GetGroup(string id)
    {
        var group = await _dataService.GetGroupAsync(id);
        if (group == null)
        {
            return NotFound();
        }
        return Ok(group);
    }

    [HttpPost]
    public async Task<ActionResult<TaskItemGroup>> CreateGroup([FromBody] CreateTaskItemGroupRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        if (request == null)
        {
            return BadRequest("Group data is required");
        }

        var group = new TaskItemGroup
        {
            Name = request.Name,
            Description = request.Description
        };

        var created = await _dataService.CreateGroupAsync(group);
        return CreatedAtAction(nameof(GetGroup), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<TaskItemGroup>> UpdateGroup(string id, [FromBody] TaskItemGroup group)
    {
        if (id != group.Id)
        {
            return BadRequest("ID mismatch");
        }

        try
        {
            var updated = await _dataService.UpdateGroupAsync(group);
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteGroup(string id)
    {
        var deleted = await _dataService.DeleteGroupAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        return NoContent();
    }

    [HttpPost("{id}/start")]
    public async Task<ActionResult> StartGroup(string id, [FromBody] StartGroupRequest? request = null)
    {
        bool success;
        
        // Kullanıcı ID'sini al
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var triggeredBy = userId ?? "Manual";
        
        if (request != null && !string.IsNullOrEmpty(request.FromTaskItemId))
        {
            // Belirli task'tan başlat
            success = await _managementService.StartGroupFromTaskAsync(id, request.FromTaskItemId, triggeredBy);
            if (!success)
            {
                return BadRequest("Grup başlatılamadı. Grup bulunamadı, grupta task yok veya belirtilen task bulunamadı.");
            }
            return Ok(new { message = "Grup belirtilen task'tan başarıyla başlatıldı." });
        }
        else
        {
            // Baştan başlat
            success = await _managementService.StartGroupAsync(id, triggeredBy);
            if (!success)
            {
                return BadRequest("Grup başlatılamadı. Grup bulunamadı veya grupta task yok.");
            }
            return Ok(new { message = "Grup başarıyla başlatıldı." });
        }
    }

}

public class StartGroupRequest
{
    public string? FromTaskItemId { get; set; }
    public string? TriggeredBy { get; set; }
}

