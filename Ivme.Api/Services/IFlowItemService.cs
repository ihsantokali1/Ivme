using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IFlowItemService
{
    Task<List<FlowItem>> GetAllFlowsAsync();
    Task<FlowItem?> GetFlowByIdAsync(string id);
    Task<FlowItem> CreateFlowAsync(FlowItem flow);
    Task<FlowItem> UpdateFlowAsync(FlowItem flow);
    Task<bool> DeleteFlowAsync(string id);
}
