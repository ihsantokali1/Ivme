using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IExecutionHistoryService
{
    Task<TaskExecutionHistory> StartTaskExecutionAsync(string taskItemId, string? groupId = null, string? groupExecutionId = null, Dictionary<string, string?>? taskParameterValues = null, string? triggeredBy = null);
    Task CompleteTaskExecutionAsync(string executionId, TaskItemStatus finalStatus, int progress);
    Task FailTaskExecutionAsync(string executionId, string errorMessage);
    Task IncrementTaskErrorCountAsync(string executionId, string errorMessage);
    Task SetTaskRetryStartTimeAsync(string executionId, DateTime retryStartTime);
    Task UpdateTaskExecutionStatusAsync(string executionId, TaskItemStatus status);
    
    Task<GroupExecutionHistory> StartGroupExecutionAsync(string groupId, string triggeredBy = "Manual");
    Task CompleteGroupExecutionAsync(string executionId, int totalTasks, int completedTasks, int failedTasks, int totalErrors);
    
    Task<List<TaskExecutionHistory>> GetTaskExecutionHistoriesAsync(string? taskItemId = null, string? groupId = null, DateTime? startDate = null, DateTime? endDate = null);
    Task<List<GroupExecutionHistory>> GetGroupExecutionHistoriesAsync(string? groupId = null, DateTime? startDate = null, DateTime? endDate = null);
    
    Task<TaskExecutionHistory?> GetTaskExecutionHistoryAsync(string executionId);
    Task<GroupExecutionHistory?> GetGroupExecutionHistoryAsync(string executionId);
    
    /// <summary>
    /// Aktif group execution'ı bul
    /// </summary>
    Task<GroupExecutionHistory?> GetActiveGroupExecutionAsync(string groupId);
    
    /// <summary>
    /// Bugün başlamış en son group execution'ı bul
    /// </summary>
    Task<GroupExecutionHistory?> GetLatestGroupExecutionTodayAsync(string groupId);
    
    /// <summary>
    /// Bugün başlamış ve henüz tamamlanmamış (EndTime null) group execution'ı bul
    /// </summary>
    Task<GroupExecutionHistory?> GetActiveGroupExecutionTodayAsync(string groupId);
    
    /// <summary>
    /// Bugün başlamış task'ların son statülerini grup bazında getirir
    /// </summary>
    Task<Dictionary<string, TaskItemStatus>> GetTodayTaskStatusesByGroupAsync();
    
    /// <summary>
    /// Bugün başlamış task'ların son statülerini ve error message'larını grup bazında getirir
    /// </summary>
    Task<Dictionary<string, (TaskItemStatus Status, string? ErrorMessage)>> GetTodayTaskStatusesWithErrorsByGroupAsync();
}

