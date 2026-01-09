using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FlowSchedulesController : ControllerBase
{
    private readonly IFlowScheduleService _flowScheduleService;

    public FlowSchedulesController(IFlowScheduleService flowScheduleService)
    {
        _flowScheduleService = flowScheduleService;
    }

    [HttpGet("flow/{flowItemId}")]
    public async Task<ActionResult<FlowSchedule>> GetFlowSchedule(string flowItemId)
    {
        var schedule = await _flowScheduleService.GetFlowScheduleAsync(flowItemId);
        if (schedule == null)
        {
            return NotFound(); // Veya NoContent? GroupSchedulesNotFound dönüyor.
        }
        return Ok(schedule);
    }

    [HttpPost]
    public async Task<ActionResult<FlowSchedule>> CreateOrUpdateFlowSchedule([FromBody] CreateOrUpdateFlowScheduleRequest request)
    {
        if (!TimeSpan.TryParse(request.StartTime, out var startTime))
        {
            return BadRequest("Invalid startTime format. Expected format: HH:mm:ss or HH:mm");
        }

        // Mevcut schedule'ı kontrol etmeden servise gönderip orada handle edebilirdik ama
        // Request -> Model dönüşümü burada yapmalıyız.
        
        // Önce id var mı diye servis çağırıp check edebiliriz veya direk modele çevirip göndeririz.
        // Ancak yeni ID oluşturma mantığı Service'de. Controller'da sadece request'i modele çevirelim.
        
        // Model oluştur
         var schedule = new FlowSchedule
        {
            Id = request.Id ?? Guid.NewGuid().ToString(),
            FlowItemId = request.FlowItemId,
            WorkPeriod = request.WorkPeriod,
            StartTime = startTime,
            RestartOnError = request.RestartOnError,
            IsActive = request.IsActive,
            LastRunTime = request.LastRunTime,
        };
        // Not: CreatedAt/UpdatedAt serviste set ediliyor.

        var result = await _flowScheduleService.CreateOrUpdateFlowScheduleAsync(schedule);
        return Ok(result);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteFlowSchedule(string id)
    {
        var deleted = await _flowScheduleService.DeleteFlowScheduleAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        return NoContent();
    }
}

public class CreateOrUpdateFlowScheduleRequest
{
    public string? Id { get; set; }
    public string FlowItemId { get; set; } = string.Empty;
    public WorkPeriod WorkPeriod { get; set; } = WorkPeriod.Daily;
    public string StartTime { get; set; } = "00:00:00"; // String formatında
    public bool RestartOnError { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public DateTime? LastRunTime { get; set; }
}
