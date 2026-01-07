using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GroupSchedulesController : ControllerBase
{
    private readonly ITaskDataService _dataService;

    public GroupSchedulesController(ITaskDataService dataService)
        {
        _dataService = dataService;
    }

    [HttpGet("group/{groupId}")]
    public async Task<ActionResult<GroupSchedule>> GetGroupSchedule(string groupId)
    {
        var schedule = await _dataService.GetGroupScheduleAsync(groupId);
        if (schedule == null)
        {
            return NotFound();
        }
        return Ok(schedule);
    }

    [HttpPost]
    public async Task<ActionResult<GroupSchedule>> CreateOrUpdateGroupSchedule([FromBody] CreateOrUpdateGroupScheduleRequest request)
    {
        if (!TimeSpan.TryParse(request.StartTime, out var startTime))
        {
            return BadRequest("Invalid startTime format. Expected format: HH:mm:ss or HH:mm");
        }

        // Mevcut schedule'ı kontrol et
        var existingSchedule = await _dataService.GetGroupScheduleAsync(request.GroupId);

        GroupSchedule schedule;
        if (existingSchedule == null)
        {
            // Yeni schedule oluştur
            schedule = new GroupSchedule
            {
                Id = Guid.NewGuid().ToString(), // Yeni Id oluştur
                GroupId = request.GroupId,
                WorkPeriod = request.WorkPeriod,
                StartTime = startTime,
                RestartOnError = request.RestartOnError,
                IsActive = request.IsActive,
                LastRunTime = request.LastRunTime,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
        }
        else
        {
            // Mevcut schedule'ı güncelle
            schedule = existingSchedule;
            schedule.WorkPeriod = request.WorkPeriod;
            schedule.StartTime = startTime;
            schedule.RestartOnError = request.RestartOnError;
            schedule.IsActive = request.IsActive;
            if (request.LastRunTime.HasValue)
            {
                schedule.LastRunTime = request.LastRunTime;
            }
            schedule.UpdatedAt = DateTime.UtcNow;
        }

        var result = await _dataService.CreateOrUpdateGroupScheduleAsync(schedule);
        return Ok(result);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteGroupSchedule(string id)
    {
        var deleted = await _dataService.DeleteGroupScheduleAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        return NoContent();
    }
}

public class CreateOrUpdateGroupScheduleRequest
{
    public string? Id { get; set; }
    public string GroupId { get; set; } = string.Empty;
    public WorkPeriod WorkPeriod { get; set; } = WorkPeriod.Daily;
    public string StartTime { get; set; } = "00:00:00"; // String formatında (örn: "09:00:00" veya "09:00")
    public bool RestartOnError { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public DateTime? LastRunTime { get; set; }
}

