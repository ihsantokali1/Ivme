using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IFlowGroupAssignmentService
{
    Task<List<FlowGroupAssignment>> GetAssignmentsByFlowAsync(string flowItemId);
    Task<FlowGroupAssignment?> GetAssignmentByIdAsync(string id);
    Task<FlowGroupAssignment> CreateAssignmentAsync(FlowGroupAssignment assignment);
    Task<FlowGroupAssignment> UpdateAssignmentAsync(FlowGroupAssignment assignment);
    Task<bool> DeleteAssignmentAsync(string id);
}
