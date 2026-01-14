using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface ITaskManagementService
{
    Task<bool> CanStartTaskItemAsync(string taskItemId, string? groupId = null);
    Task<(bool canStart, string? reason)> CanStartTaskItemWithReasonAsync(string taskItemId, string? groupId = null);
    Task<bool> StartTaskItemAsync(string taskItemId, string? groupId = null, bool skipCanStartCheck = false, string? triggeredBy = null, string? flowItemId = null, string? flowItemExecutionId = null);
    Task<bool> PauseTaskItemAsync(string taskItemId, string? groupId = null);
    Task<bool> ResumeTaskItemAsync(string taskItemId, string? groupId = null);
    Task<bool> StopTaskItemAsync(string taskItemId, string? groupId = null);
    Task<bool> CompleteTaskItemAsync(string taskItemId, string? groupId = null);
    Task<bool> MarkTaskAsSuccessAsync(string taskItemId, string? groupId = null, List<string>? debugLogs = null, string? groupExecutionId = null);
    Task<bool> FailTaskItemAsync(string taskItemId, string errorMessage, string? groupId = null);
    Task UpdateTaskItemProgressAsync(string taskItemId, int progress, string? groupId = null);
    Task CheckAndUpdateTaskItemStatusesAsync();
    Task<List<TaskItem>> GetReadyTaskItemsAsync();
    Task<bool> StartGroupAsync(string groupId, string triggeredBy = "Manual", string? flowItemId = null, string? flowItemExecutionId = null);
    Task<bool> StartGroupFromTaskAsync(string groupId, string fromTaskItemId, string triggeredBy = "Manual", string? flowItemId = null, string? flowItemExecutionId = null);
    Task<bool> StartFlowAsync(string flowItemId, string triggeredBy = "Manual");
    Task<bool> RestartTaskItemAsync(string taskItemId, string? groupId = null, string? triggeredBy = null);
    Task CheckAndTriggerScheduledGroupsAsync();
    Task CheckAndTriggerScheduledFlowsAsync();

    // Group interventions in flows
    Task<bool> MarkGroupAsSuccessAsync(string groupId, string flowItemExecutionId);
    Task<bool> StopGroupAsync(string groupId, string flowItemExecutionId);
    Task<bool> PauseGroupAsync(string groupId, string flowItemExecutionId);
    Task<bool> ResumeGroupAsync(string groupId, string flowItemExecutionId);
    Task<bool> RestartGroupInFlowAsync(string groupId, string flowItemId, string flowItemExecutionId);
}

