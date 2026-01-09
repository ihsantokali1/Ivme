using Ivme.Api.Data;
using Ivme.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Ivme.Api.Services;

public class FlowScheduleService : IFlowScheduleService
{
    private readonly TaskDbContext _dbContext;

    public FlowScheduleService(TaskDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<FlowSchedule> CreateOrUpdateFlowScheduleAsync(FlowSchedule schedule)
    {
        var existing = await _dbContext.FlowSchedules.FirstOrDefaultAsync(s => s.FlowItemId == schedule.FlowItemId);
        
        if (existing == null)
        {
            // Yeni schedule ekle
            if (string.IsNullOrEmpty(schedule.Id))
                schedule.Id = Guid.NewGuid().ToString();

            if (schedule.CreatedAt == default)
                schedule.CreatedAt = DateTime.UtcNow;
            if (schedule.UpdatedAt == default)
                schedule.UpdatedAt = DateTime.UtcNow;

            _dbContext.FlowSchedules.Add(schedule);
        }
        else
        {
            // Güncelle
            existing.WorkPeriod = schedule.WorkPeriod;
            existing.StartTime = schedule.StartTime;
            existing.RestartOnError = schedule.RestartOnError;
            existing.IsActive = schedule.IsActive;
            if (schedule.LastRunTime.HasValue)
                existing.LastRunTime = schedule.LastRunTime;
            
            existing.UpdatedAt = DateTime.UtcNow;
            schedule = existing;
        }

        await _dbContext.SaveChangesAsync();
        return schedule;
    }

    public async Task<FlowSchedule?> GetFlowScheduleAsync(string flowItemId)
    {
        return await _dbContext.FlowSchedules.FirstOrDefaultAsync(s => s.FlowItemId == flowItemId);
    }

    public async Task<bool> DeleteFlowScheduleAsync(string scheduleId)
    {
        var schedule = await _dbContext.FlowSchedules.FindAsync(scheduleId);
        if (schedule == null) return false;

        _dbContext.FlowSchedules.Remove(schedule);
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task<List<FlowSchedule>> GetActiveFlowSchedulesAsync()
    {
        return await _dbContext.FlowSchedules
            .Where(s => s.IsActive)
            .AsNoTracking()
            .ToListAsync();
    }
}
