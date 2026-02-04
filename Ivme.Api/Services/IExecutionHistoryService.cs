using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IExecutionHistoryService
{
    Task<TaskExecutionHistory> StartTaskExecutionAsync(string taskItemId, string? groupId = null, string? groupExecutionId = null, string? flowItemId = null, string? flowItemExecutionId = null, Dictionary<string, string?>? taskParameterValues = null, string? triggeredBy = null);
    Task CompleteTaskExecutionAsync(string executionId, TaskItemStatus finalStatus, int progress);
    Task FailTaskExecutionAsync(string executionId, string errorMessage);
    Task IncrementTaskErrorCountAsync(string executionId, string errorMessage);
    Task SetTaskRetryStartTimeAsync(string executionId, DateTime retryStartTime);
    Task UpdateTaskExecutionStatusAsync(string executionId, TaskItemStatus status);
    
    Task<GroupExecutionHistory> StartGroupExecutionAsync(string groupId, string triggeredBy = "Manual", string? flowItemId = null, string? flowItemExecutionId = null);
    Task CompleteGroupExecutionAsync(string executionId, int totalTasks, int completedTasks, int failedTasks, int totalErrors, int markedAsSuccessTasks = 0, TaskItemStatus? status = null, bool isFinished = true);
    
    // Flow Execution
    Task<FlowExecutionHistory> StartFlowExecutionAsync(string flowItemId, string triggeredBy = "Manual");
    Task CompleteFlowExecutionAsync(string executionId, string status = "Completed");
    Task<FlowExecutionHistory?> GetActiveFlowExecutionAsync(string flowItemId);
    Task TerminateActiveExecutionsAsync(string flowItemId, string reason);
    Task<FlowExecutionHistory?> GetFlowExecutionHistoryAsync(string executionId);
    Task<List<FlowExecutionHistory>> GetFlowExecutionHistoriesAsync(string? flowItemId = null, DateTime? startDate = null, DateTime? endDate = null);
    
    Task<List<TaskExecutionHistory>> GetTaskExecutionHistoriesAsync(string? taskItemId = null, string? groupId = null, string? groupExecutionId = null, string? flowItemExecutionId = null, DateTime? startDate = null, DateTime? endDate = null);
    Task<List<GroupExecutionHistory>> GetGroupExecutionHistoriesAsync(string? groupId = null, string? flowItemExecutionId = null, DateTime? startDate = null, DateTime? endDate = null);
    
    Task<TaskExecutionHistory?> GetTaskExecutionHistoryAsync(string executionId);
    Task<GroupExecutionHistory?> GetGroupExecutionHistoryAsync(string executionId);
    
    /// <summary>
    /// Aktif execution'ı task item ID'ye göre bul
    /// </summary>
    Task<TaskExecutionHistory?> GetActiveTaskExecutionAsync(string taskItemId);

    /// <summary>
    /// Aktif group execution'ı bul
    /// </summary>
    Task<GroupExecutionHistory?> GetActiveGroupExecutionAsync(string groupId);

    /// <summary>
    /// Tüm aktif grup execution'larını getir
    /// </summary>
    Task<List<GroupExecutionHistory>> GetAllActiveGroupExecutionsAsync();

    /// <summary>
    /// Tüm aktif task execution'larını getir
    /// </summary>
    Task<List<TaskExecutionHistory>> GetAllActiveTaskExecutionsAsync();
    
    /// <summary>
    /// Tüm aktif flow execution'larını getir
    /// </summary>
    Task<List<FlowExecutionHistory>> GetAllActiveFlowExecutionsAsync();

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
    Task<Dictionary<string, TaskItemStatus>> GetTodayTaskStatusesByGroupAsync(string? groupExecutionId = null, string? flowItemExecutionId = null);
    
    /// <summary>
    /// Bugün başlamış task'ların son statülerini ve error message'larını grup bazında getirir
    /// </summary>
    Task<Dictionary<string, (TaskItemStatus Status, string? ErrorMessage)>> GetTodayTaskStatusesWithErrorsByGroupAsync(string? groupExecutionId = null, string? flowItemExecutionId = null);

    /// <summary>
    /// Bugün başlamış flow'ların son statülerini getirir
    /// </summary>
    Task<Dictionary<string, string>> GetTodayFlowStatusesAsync();

    /// <summary>
    /// Dashboard için detaylı metrikleri getirir
    /// </summary>
    Task<DashboardMetrics> GetDashboardMetricsAsync();
}

