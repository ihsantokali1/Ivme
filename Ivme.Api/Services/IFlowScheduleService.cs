using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IFlowScheduleService
{
    Task<FlowSchedule> CreateOrUpdateFlowScheduleAsync(FlowSchedule schedule);
    Task<FlowSchedule?> GetFlowScheduleAsync(string flowItemId);
    Task<bool> DeleteFlowScheduleAsync(string scheduleId);
    Task<List<FlowSchedule>> GetActiveFlowSchedulesAsync();
}
