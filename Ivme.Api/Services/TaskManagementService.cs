using Ivme.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using Microsoft.Data.SqlClient;
using System.Collections.Concurrent;
using Ivme.Api.Data;

namespace Ivme.Api.Services;

public class TaskManagementService : ITaskManagementService
{
    private readonly ITaskDataService _dataService;
    private readonly IExecutionHistoryService _executionHistoryService;
    private readonly DatabaseConfig _dbConfig;
    private readonly TaskDbContext? _dbContext;
    private readonly IServiceScopeFactory? _serviceScopeFactory;
    private static readonly ConcurrentDictionary<string, byte> _processingTaskIds = new(); // Concurrency control

    public TaskManagementService(
        ITaskDataService dataService, 
        IExecutionHistoryService executionHistoryService,
        DatabaseConfig dbConfig,
        TaskDbContext? dbContext = null,
        IServiceScopeFactory? serviceScopeFactory = null)
    {
        _dataService = dataService;
        _executionHistoryService = executionHistoryService;
        _dbConfig = dbConfig;
        _dbContext = dbContext;
        _serviceScopeFactory = serviceScopeFactory;
    }

    /// <summary>
    /// Task durumunu hem TaskItem'da hem de GroupTaskAssignment'ta günceller
    /// </summary>
    private async Task UpdateTaskStatusInAssignmentAsync(
        string taskItemId, 
        string? groupId,
        Action<GroupTaskAssignment> updateAction,
        bool logStatusChange = false)
    {
        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        if (!string.IsNullOrEmpty(groupId))
        {
            var data = await _dataService.GetDataAsync();
            var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == groupId);
            if (assignment != null)
            {
                var oldStatus = assignment.Status;
                updateAction(assignment);
                var newStatus = assignment.Status;
                
                // Statü değiştiyse logla
                if (logStatusChange && oldStatus != newStatus)
                {
                    var taskItem = data.TaskItems.FirstOrDefault(t => t.Id == taskItemId);
                    var taskName = taskItem?.Name ?? taskItemId;
                    var groupName = data.Groups.FirstOrDefault(g => g.Id == groupId)?.Name ?? "Unknown";
                    Console.WriteLine($"[STATUS] Task '{taskName}' in group '{groupName}' -> {newStatus}");
                }
                
                assignment.UpdatedAt = DateTime.Now;
                await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
            }
        }
    }

    /// <summary>
    /// GroupId belirtilmemişse, execution history'den bul (daha doğru)
    /// </summary>
    private async Task<string?> ResolveGroupIdAsync(string taskItemId, string? groupId)
    {
        if (!string.IsNullOrEmpty(groupId))
        {
            return groupId;
        }

        // Execution history'den bul
        var historyService = _executionHistoryService as ExecutionHistoryService;
        if (historyService != null)
        {
            var activeExecution = await historyService.GetActiveTaskExecutionAsync(taskItemId);
            if (activeExecution != null)
            {
                return activeExecution.GroupId;
            }
        }

        // Execution history'de bulunamazsa, assignment'tan bul (geriye uyumluluk)
        var data = await _dataService.GetDataAsync();
        var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId);
        return assignment?.GroupId;
    }

    public async Task<bool> CanStartTaskItemAsync(string taskItemId, string? groupId = null)
    {
        var (canStart, _) = await CanStartTaskItemWithReasonAsync(taskItemId, groupId);
        return canStart;
    }

    public async Task<(bool canStart, string? reason)> CanStartTaskItemWithReasonAsync(string taskItemId, string? groupId = null, string? flowExecutionId = null, string? groupExecutionId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return (false, "Task item bulunamadı.");
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        // Execution history'den bugünün statüsünü kontrol et
        if (!string.IsNullOrEmpty(groupId))
        {
            // FlowExecutionId veya GroupExecutionId ile filtrele!
            var todayStatuses = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync(
                groupExecutionId: groupExecutionId,
                flowItemExecutionId: flowExecutionId);
            
            var key = $"{groupId}-{taskItemId}";
            
            if (todayStatuses.ContainsKey(key))
            {
                // Execution history'de varsa, statüyü oradan kontrol et
                var status = todayStatuses[key];
                if (status == TaskItemStatus.Pending || 
                    status == TaskItemStatus.Ready || 
                    status == TaskItemStatus.WaitingRetry)
                {
                    return (true, null);
                }
                return (false, $"Task şu anda '{status}' durumunda. Sadece Pending, Ready veya WaitingRetry durumundaki task'lar başlatılabilir.");
            }
            else
            {
                // Execution history'de yoksa, assignment'tan kontrol et
                var data = await _dataService.GetDataAsync();
                var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == groupId);
                if (assignment != null)
                {
                    // Assignment durumunu kontrol et
                    if (assignment.Status == TaskItemStatus.Pending || 
                        assignment.Status == TaskItemStatus.Ready || 
                        assignment.Status == TaskItemStatus.WaitingRetry ||
                        assignment.Status == TaskItemStatus.Completed ||
                        assignment.Status == TaskItemStatus.Failed) // Completed/Failed olsa bile yeni bir akışta tekrar çalışabilir
                    {
                        return (true, null);
                    }
                    return (false, $"Task assignment şu anda '{assignment.Status}' durumunda. Sadece Pending, Ready veya WaitingRetry durumundaki task'lar başlatılabilir.");
                }
                // Assignment bulunamadıysa false döndür
                return (false, $"Task item '{taskItemId}' için grup '{groupId}' içinde assignment bulunamadı.");
            }
        }

        // GroupId yoksa, TaskExecutionHistory'den bugünün statüsünü kontrol et
        // Bugün başlamış en son execution'ı bul
        var historyService = _executionHistoryService as ExecutionHistoryService;
        if (historyService != null)
        {
            var dbContext = historyService.GetDbContextPublic();
            if (dbContext != null)
            {
                var today = DateTime.Now.Date;
                var todayExecution = await dbContext.TaskExecutionHistories
                    .Where(e => e.TaskItemId == taskItemId && e.StartTime.Date == today)
                    .OrderByDescending(e => e.StartTime)
                    .FirstOrDefaultAsync();
                
                if (todayExecution != null)
                {
                    if (todayExecution.FinalStatus == TaskItemStatus.Pending || 
                        todayExecution.FinalStatus == TaskItemStatus.Ready || 
                        todayExecution.FinalStatus == TaskItemStatus.WaitingRetry)
                    {
                        return (true, null);
                    }
                    return (false, $"Task şu anda '{todayExecution.FinalStatus}' durumunda. Sadece Pending, Ready veya WaitingRetry durumundaki task'lar başlatılabilir.");
                }
            }
        }
        
        // Bugün hiç execution yoksa, başlatılabilir
        return (true, null);
    }

    public async Task<bool> StartTaskItemAsync(string taskItemId, string? groupId = null, bool skipCanStartCheck = false, string? triggeredBy = null, string? flowItemId = null, string? flowItemExecutionId = null, string? groupExecutionId = null)
    {
        if (!skipCanStartCheck)
        {
            var (canStart, reason) = await CanStartTaskItemWithReasonAsync(taskItemId, groupId, flowItemExecutionId, groupExecutionId);
            if (!canStart)
            {
                Console.WriteLine($"[StartTaskItemAsync] Cannot start task {taskItemId}: {reason}");
                return false;
            }
        }

        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        // GroupTaskAssignment durumunu güncelle (grup bazlı durum)
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir ve 
        // farklı gruplardaki aynı task'ın durumlarını birbirinden bağımsız tutmak için
        // sadece GroupTaskAssignment durumunu kullanıyoruz
        GroupTaskAssignment? assignment = null;
        if (!string.IsNullOrEmpty(groupId))
        {
            var data = await _dataService.GetDataAsync();
            assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == groupId);
            if (assignment != null)
            {
                // ÖNEMLİ: Eğer task zaten Running durumundaysa, tekrar başlatma (duplicate execution önleme)
                if (assignment.Status == TaskItemStatus.Running)
                {
                    return false;
                }
                
                assignment.Status = TaskItemStatus.Running;
                assignment.StartTime = DateTime.Now;
                assignment.ErrorMessage = null;
                assignment.LastErrorTime = null;
                assignment.Progress = 0;
                assignment.UpdatedAt = DateTime.Now;
                await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
            }
        }
        
        // groupExecutionId parametre olarak verilmemişse, bul
        if (string.IsNullOrEmpty(groupExecutionId) && !string.IsNullOrEmpty(groupId))
        {
            // FlowItemExecutionId verilmişse, ona ait olanı bul
            if (!string.IsNullOrEmpty(flowItemExecutionId))
            {
                var execs = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId, flowItemExecutionId);
                var matchingExec = execs.FirstOrDefault(e => e.EndTime == null);
                if (matchingExec != null) groupExecutionId = matchingExec.Id;
            }

            // Hala bulunamadıysa (veya flowItemExecutionId yoksa), bugün başlamış aktif olanı bul
            if (string.IsNullOrEmpty(groupExecutionId))
            {
                var groupExecution = await _executionHistoryService.GetActiveGroupExecutionTodayAsync(groupId);
                if (groupExecution != null)
                {
                    groupExecutionId = groupExecution.Id;
                }
            }
        }
        
        // Execution history başlat - parametreleri de ekle
        // StartTaskExecutionAsync içinde zaten Pending kaydı kontrol ediliyor ve güncelleniyor
        // Eğer triggeredBy belirtilmemişse ve groupExecutionId varsa, group execution'dan TriggeredBy'ı al
        // Bu sayede grubu manuel başlatan kullanıcı, o grubun execution'ındaki tüm task'lardan sorumlu olur
        if (triggeredBy == null && !string.IsNullOrEmpty(groupExecutionId))
        {
            var groupExecution = await _executionHistoryService.GetGroupExecutionHistoryAsync(groupExecutionId);
            triggeredBy = groupExecution?.TriggeredBy;
        }
        // Eğer hala null ise ve group execution içinde değilse, "System" olarak ayarla (schedule ile başlatılmış olabilir)
        if (triggeredBy == null && string.IsNullOrEmpty(groupExecutionId))
        {
            triggeredBy = "System";
        }
        var parameterValues = assignment?.TaskParameterValues ?? new Dictionary<string, string?>();
        await _executionHistoryService.StartTaskExecutionAsync(taskItemId, groupId, groupExecutionId, flowItemId, flowItemExecutionId, parameterValues, triggeredBy);
        
        // Eğer SP ise, SP'yi çalıştır
        if (taskItem.SourceType.HasValue && taskItem.SourceType.Value == TaskSourceType.StoredProcedure && !string.IsNullOrEmpty(taskItem.StoredProcedureName))
        {
            _ = Task.Run(async () =>
            {
                // Yeni scope oluştur - DbContext thread-safe değil
                if (_serviceScopeFactory != null)
                {
                    using var scope = _serviceScopeFactory.CreateScope();
                    var scopedDataService = scope.ServiceProvider.GetRequiredService<ITaskDataService>();
                    var scopedExecutionHistoryService = scope.ServiceProvider.GetRequiredService<IExecutionHistoryService>();
                    var scopedTaskManagementService = scope.ServiceProvider.GetRequiredService<ITaskManagementService>();
                    
                    try
                    {
                        await ExecuteStoredProcedureAsync(taskItem, groupId, scopedDataService);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SP Execution] Error executing SP {taskItem.StoredProcedureName}: {ex.Message}");
                        // FailTaskItemAsync'ı da scoped service ile çağırmalıyız
                        await scopedTaskManagementService.FailTaskItemAsync(taskItemId, $"SP execution error: {ex.Message}", groupId);
                    }
                }
                else
                {
                    // ServiceScopeFactory yoksa (test ortamı gibi) direkt çalıştır
                    try
                    {
                        await ExecuteStoredProcedureAsync(taskItem, groupId, _dataService);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SP Execution] Error executing SP {taskItem.StoredProcedureName}: {ex.Message}");
                        await FailTaskItemAsync(taskItemId, $"SP execution error: {ex.Message}", groupId);
                    }
                }
            });
        }
        
        return true;
    }

    public async Task<bool> PauseTaskItemAsync(string taskItemId, string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, assignment'tan bul
        if (string.IsNullOrEmpty(groupId))
        {
            var data = await _dataService.GetDataAsync();
            var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId);
            groupId = assignment?.GroupId;
        }

        // Execution history'den bugünün statüsünü kontrol et
        // UI'da todayStatus gösteriliyor, bu yüzden backend'de de execution history'den kontrol etmeliyiz
        var todayStatuses = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync();
        bool isRunning = false;
        
        if (!string.IsNullOrEmpty(groupId))
        {
            var key = $"{groupId}-{taskItemId}";
            isRunning = todayStatuses.ContainsKey(key) && todayStatuses[key] == TaskItemStatus.Running;
        }
        else
        {
            // GroupId yoksa, tüm gruplarda kontrol et
            isRunning = todayStatuses.Any(kvp => kvp.Key.EndsWith($"-{taskItemId}") && kvp.Value == TaskItemStatus.Running);
        }
        
        if (!isRunning)
        {
            return false;
        }

        // GroupTaskAssignment durumunu güncelle
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir
        await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
        {
            assignment.Status = TaskItemStatus.Paused;
        }, logStatusChange: true);
        
        // Execution history'de durumu güncelle ve tamamla (Paused durumunda EndTime set et)
        var historyService = _executionHistoryService as ExecutionHistoryService;
        if (historyService != null)
        {
            var activeExecution = await historyService.GetActiveTaskExecutionAsync(taskItemId);
            if (activeExecution != null)
            {
                await _executionHistoryService.CompleteTaskExecutionAsync(
                    activeExecution.Id, 
                    TaskItemStatus.Paused, 
                    taskItem.Progress
                );
            }
        }
        
        return true;
    }

    public async Task<bool> ResumeTaskItemAsync(string taskItemId, string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        // Execution history'den bugünün statüsünü kontrol et
        // UI'da todayStatus gösteriliyor, bu yüzden backend'de de execution history'den kontrol etmeliyiz
        var todayStatuses = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync();
        bool isPaused = false;
        
        if (!string.IsNullOrEmpty(groupId))
        {
            var key = $"{groupId}-{taskItemId}";
            isPaused = todayStatuses.ContainsKey(key) && todayStatuses[key] == TaskItemStatus.Paused;
        }
        else
        {
            // GroupId yoksa, tüm gruplarda kontrol et
            isPaused = todayStatuses.Any(kvp => kvp.Key.EndsWith($"-{taskItemId}") && kvp.Value == TaskItemStatus.Paused);
        }
        
        if (!isPaused)
        {
            return false;
        }

        // GroupTaskAssignment durumunu güncelle
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir
        await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
        {
            assignment.Status = TaskItemStatus.Running;
            if (!assignment.StartTime.HasValue)
            {
                assignment.StartTime = DateTime.Now;
            }
        });
        
        // Resume işlemi için yeni bir execution history başlat (çünkü önceki paused olarak tamamlandı)
        // Aktif group execution'ı bul ve groupExecutionId'yi al
        string? groupExecutionId = null;
        GroupExecutionHistory? latestGroupExecution = null;
        if (!string.IsNullOrEmpty(groupId))
        {
            latestGroupExecution = await _executionHistoryService.GetLatestGroupExecutionTodayAsync(groupId);
            groupExecutionId = latestGroupExecution?.Id;
        }
        // Parametreleri al
        var data = await _dataService.GetDataAsync();
        var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == groupId);
        var parameterValues = assignment?.TaskParameterValues ?? new Dictionary<string, string?>();
        
        var flowItemId = latestGroupExecution?.FlowItemId;
        var flowItemExecutionId = latestGroupExecution?.FlowItemExecutionId;

        await _executionHistoryService.StartTaskExecutionAsync(taskItemId, groupId, groupExecutionId, flowItemId, flowItemExecutionId, parameterValues);
        
        return true;
    }

    public async Task<bool> StopTaskItemAsync(string taskItemId, string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        // Execution history'den bugünün statüsünü kontrol et
        // UI'da todayStatus gösteriliyor, bu yüzden backend'de de execution history'den kontrol etmeliyiz
        var todayStatuses = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync();
        bool shouldStop = false;
        
        if (!string.IsNullOrEmpty(groupId))
        {
            var key = $"{groupId}-{taskItemId}";
            if (todayStatuses.ContainsKey(key))
            {
                var status = todayStatuses[key];
                // Running, Paused veya Failed durumunda durdurulabilir
                shouldStop = status == TaskItemStatus.Running || 
                            status == TaskItemStatus.Paused || 
                            status == TaskItemStatus.Failed;
            }
        }
        else
        {
            // GroupId yoksa, tüm gruplarda kontrol et
            shouldStop = todayStatuses.Any(kvp => 
                kvp.Key.EndsWith($"-{taskItemId}") && 
                (kvp.Value == TaskItemStatus.Running || 
                 kvp.Value == TaskItemStatus.Paused || 
                 kvp.Value == TaskItemStatus.Failed));
        }

        if (shouldStop)
        {
            // GroupTaskAssignment durumunu güncelle
            // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir
            await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
            {
                assignment.Status = TaskItemStatus.Pending;
                assignment.StartTime = null;
                assignment.Progress = 0;
            });
            
            // Execution history'yi tamamla (durduruldu olarak işaretle)
            // Bugünün en son execution'ını bul (aktif olmasa bile, Failed durumunda EndTime set edilmiş olabilir)
            var historyService = _executionHistoryService as ExecutionHistoryService;
            if (historyService != null)
            {
                var dbContext = historyService.GetDbContextPublic();
                if (dbContext != null && !string.IsNullOrEmpty(groupId))
                {
                    // Bugün başlamış en son group execution'ı bul
                    var latestGroupExecution = await _executionHistoryService.GetLatestGroupExecutionTodayAsync(groupId);
                    if (latestGroupExecution != null)
                    {
                        // Bu group execution'dan sonraki task execution'larını bul
                        var taskExecutions = await dbContext.TaskExecutionHistories
                            .Where(e => e.TaskItemId == taskItemId && 
                                       e.GroupId == groupId &&
                                       e.GroupExecutionId == latestGroupExecution.Id &&
                                       e.StartTime >= latestGroupExecution.StartTime)
                            .OrderByDescending(e => e.StartTime)
                            .ToListAsync();
                        
                        var latestExecution = taskExecutions.FirstOrDefault();
                        if (latestExecution != null)
                        {
                            // Execution'ı Pending olarak güncelle (EndTime set edilmiş olsa bile)
                            // Eğer aktifse (EndTime null), CompleteTaskExecutionAsync kullan
                            // Eğer aktif değilse (EndTime set edilmiş), UpdateTaskExecutionStatusAsync kullan
                            if (latestExecution.EndTime == null)
                            {
                                await _executionHistoryService.CompleteTaskExecutionAsync(
                                    latestExecution.Id, 
                                    TaskItemStatus.Pending, 
                                    taskItem.Progress
                                );
                            }
                            else
                            {
                                // EndTime set edilmişse, sadece statüyü güncelle
                                await _executionHistoryService.UpdateTaskExecutionStatusAsync(
                                    latestExecution.Id, 
                                    TaskItemStatus.Pending
                                );
                            }
                        }
                    }
                }
                else
                {
                    // JSON modunda veya groupId yoksa - aktif execution'dan kontrol et
                    var activeExecution = await historyService.GetActiveTaskExecutionAsync(taskItemId);
                    if (activeExecution != null)
                    {
                        await _executionHistoryService.CompleteTaskExecutionAsync(
                            activeExecution.Id, 
                            TaskItemStatus.Pending, 
                            taskItem.Progress
                        );
                    }
                }
            }
            
            return true;
        }

        return false;
    }

    public async Task<bool> CompleteTaskItemAsync(string taskItemId, string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, önce assignment'tan bul (daha güvenilir)
        string? resolvedGroupId = groupId;
        if (string.IsNullOrEmpty(resolvedGroupId))
        {
            var data = await _dataService.GetDataAsync();
            var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId);
            resolvedGroupId = assignment?.GroupId;
        }

        // Execution history'yi tamamla ve groupId/GroupExecutionId'yi al
        var historyService = _executionHistoryService as ExecutionHistoryService;
        string? completedTaskGroupExecutionId = null;
        TaskExecutionHistory? executionToComplete = null;
        
        if (historyService != null)
        {
            // Önce aktif execution'ı bul (EndTime null olan)
            var activeExecution = await historyService.GetActiveTaskExecutionAsync(taskItemId);
            if (activeExecution != null)
            {
                executionToComplete = activeExecution;
                // groupId execution'dan al (daha doğru)
                if (string.IsNullOrEmpty(resolvedGroupId))
                {
                    resolvedGroupId = activeExecution.GroupId;
                }
            }
            else
            {
                // Aktif execution yoksa (Failed task'lar için), bugünün en son execution'ını bul
                var dbContext = historyService.GetDbContextPublic();
                if (dbContext != null)
                {
                    var todayStart = DateTime.Now.Date;
                    var todayEnd = todayStart.AddDays(1);
                    
                    if (!string.IsNullOrEmpty(resolvedGroupId))
                    {
                        // Bugün başlamış en son execution'ı bul (Failed task'lar için)
                        executionToComplete = await dbContext.TaskExecutionHistories
                            .Where(e => e.TaskItemId == taskItemId && 
                                       e.GroupId == resolvedGroupId &&
                                       e.StartTime >= todayStart && 
                                       e.StartTime < todayEnd)
                            .OrderByDescending(e => e.StartTime)
                            .FirstOrDefaultAsync();
                    }
                    else
                    {
                        // GroupId yoksa, bugün başlamış herhangi bir execution'ı bul
                        executionToComplete = await dbContext.TaskExecutionHistories
                            .Where(e => e.TaskItemId == taskItemId &&
                                       e.StartTime >= todayStart && 
                                       e.StartTime < todayEnd)
                            .OrderByDescending(e => e.StartTime)
                            .FirstOrDefaultAsync();
                        
                        if (executionToComplete != null)
                        {
                            resolvedGroupId = executionToComplete.GroupId;
                        }
                    }
                }
            }
            
            if (executionToComplete != null)
            {
                completedTaskGroupExecutionId = executionToComplete.GroupExecutionId;
                await _executionHistoryService.CompleteTaskExecutionAsync(executionToComplete.Id, TaskItemStatus.Completed, 100);
            }
            else if (!string.IsNullOrEmpty(resolvedGroupId))
            {
                // Execution bulunamadı ama groupId var, yeni bir Completed execution oluştur
                // Bugünün group execution'ını bul
                var latestGroupExecution = await _executionHistoryService.GetLatestGroupExecutionTodayAsync(resolvedGroupId);
                if (latestGroupExecution != null)
                {
                    completedTaskGroupExecutionId = latestGroupExecution.Id;
                    // Yeni bir Completed execution oluştur
                    var data = await _dataService.GetDataAsync();
                    var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == resolvedGroupId);
                    var parameterValues = assignment?.TaskParameterValues ?? new Dictionary<string, string?>();
                    
                    var flowItemId = latestGroupExecution.FlowItemId;
                    var flowItemExecutionId = latestGroupExecution.FlowItemExecutionId;
                    
                    var newExecution = await _executionHistoryService.StartTaskExecutionAsync(taskItemId, resolvedGroupId, completedTaskGroupExecutionId, flowItemId, flowItemExecutionId, parameterValues);
                    await _executionHistoryService.CompleteTaskExecutionAsync(newExecution.Id, TaskItemStatus.Completed, 100);
                }
            }
        }

        // GroupTaskAssignment durumunu güncelle
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir ve 
        // farklı gruplardaki aynı task'ın durumlarını birbirinden bağımsız tutmak için
        // sadece GroupTaskAssignment durumunu kullanıyoruz
        // ÖNEMLİ: Sadece belirtilen grup (veya execution history'den bulunan grup) için güncelle
        if (!string.IsNullOrEmpty(resolvedGroupId))
        {
            await UpdateTaskStatusInAssignmentAsync(taskItemId, resolvedGroupId, assignment =>
            {
                assignment.Status = TaskItemStatus.Completed;
                assignment.EndTime = DateTime.Now;
                assignment.Progress = 100;
                assignment.ErrorMessage = null;
            }, logStatusChange: true);
        }
        else
        {
            // GroupId hala null ise, tüm assignment'ları güncelle (geriye uyumluluk)
            var data = await _dataService.GetDataAsync();
            var assignments = data.GroupTaskAssignments.Where(a => a.TaskItemId == taskItemId).ToList();
            foreach (var assignment in assignments)
            {
                assignment.Status = TaskItemStatus.Completed;
                assignment.EndTime = DateTime.Now;
                assignment.Progress = 100;
                assignment.ErrorMessage = null;
                assignment.UpdatedAt = DateTime.Now;
                await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
            }
        }

        // Bu task item'ın tamamlanması, bağımlı task itemları kontrol etmek için tetiklenir
        await CheckAndUpdateTaskItemStatusesAsync();
        
        // Tamamlanan task'ı önşart olarak kullanan bağımlı task'ları başlat
        // ÖNEMLİ: Tamamlanan task'ın group execution ID'sini geçir
        await StartDependentTasksAsync(taskItemId, resolvedGroupId, completedTaskGroupExecutionId);

        return true;
    }

    public async Task<bool> MarkTaskAsSuccessAsync(string taskItemId, string? groupId = null, List<string>? debugLogs = null, string? groupExecutionId = null)
    {
        try
        {
            // Log helper function
            void AddLog(string message)
            {
                // Logları sadece debugLogs'a ekle, Console'a yazma
                if (debugLogs != null)
                {
                    debugLogs.Add(message);
                }
                System.Diagnostics.Trace.WriteLine(message);
                debugLogs?.Add(message);
            }
            
            // HER ZAMAN GÖRÜNEN LOG - Metodun başladığını göster
            var startLog = $"[MarkTaskAsSuccessAsync] ========== START ========== taskItemId: {taskItemId}, groupId: {groupId ?? "null"}";
            AddLog(startLog);
            
            var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
            if (taskItem == null)
            {
                var notFoundLog = $"[MarkTaskAsSuccessAsync] TaskItem not found: {taskItemId}";
                AddLog(notFoundLog);
                return false;
            }
            var foundLog = $"[MarkTaskAsSuccessAsync] TaskItem found: {taskItem.Name}";
            AddLog(foundLog);

            // GroupId belirtilmemişse, önce assignment'tan bul (daha güvenilir)
            string? resolvedGroupId = groupId;
            if (string.IsNullOrEmpty(resolvedGroupId))
            {
                var data = await _dataService.GetDataAsync();
                var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId);
                resolvedGroupId = assignment?.GroupId;
            }

            // Execution history'yi güncelle ve groupId/GroupExecutionId'yi al
            var historyService = _executionHistoryService as ExecutionHistoryService;
            string? completedTaskGroupExecutionId = null;
            TaskExecutionHistory? executionToMark = null;
            
            if (historyService != null)
            {
                var dbContext = historyService.GetDbContextPublic();
                if (dbContext != null)
                {
                    // ÖNEMLİ: UI'dan groupExecutionId geldiyse, direkt onu kullan
                    GroupExecutionHistory? currentGroupExecution = null;
                    
                    if (!string.IsNullOrEmpty(groupExecutionId))
                    {
                        // UI'dan gelen groupExecutionId'yi kullan
                        AddLog($"[MarkTaskAsSuccessAsync] ========== GROUPEXECUTIONID PROVIDED ==========");
                        AddLog($"[MarkTaskAsSuccessAsync] Provided groupExecutionId: {groupExecutionId}");
                        AddLog($"[MarkTaskAsSuccessAsync] TaskItemId: {taskItemId}");
                        
                        currentGroupExecution = await historyService.GetGroupExecutionHistoryAsync(groupExecutionId);
                        if (currentGroupExecution != null)
                        {
                            completedTaskGroupExecutionId = currentGroupExecution.Id;
                            resolvedGroupId = currentGroupExecution.GroupId;
                            AddLog($"[MarkTaskAsSuccessAsync] GroupExecution found: Id={currentGroupExecution.Id}, GroupId={currentGroupExecution.GroupId}, StartTime={currentGroupExecution.StartTime}");
                            
                            // ÖNEMLİ: Sadece bu group execution içindeki task execution'ları kontrol et
                            // Önce bu group execution içinde bu taskItemId için kaç execution var kontrol et
                            var allExecutionsInThisGroup = await dbContext.TaskExecutionHistories
                                .Where(e => e.TaskItemId == taskItemId && 
                                           e.GroupExecutionId == currentGroupExecution.Id)
                                .ToListAsync();
                            
                            AddLog($"[MarkTaskAsSuccessAsync] Found {allExecutionsInThisGroup.Count} task executions in GroupExecution {currentGroupExecution.Id} for TaskItemId {taskItemId}");
                            foreach (var exec in allExecutionsInThisGroup)
                            {
                                AddLog($"[MarkTaskAsSuccessAsync]   - Execution {exec.Id}: Status={exec.FinalStatus}, StartTime={exec.StartTime}, EndTime={exec.EndTime}, GroupId={exec.GroupId}");
                            }
                        }
                        else
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] ERROR: GroupExecutionId {groupExecutionId} not found in database!");
                            AddLog($"[MarkTaskAsSuccessAsync] Falling back to search (this may cause wrong execution to be updated)");
                        }
                    }
                    
                    // GroupExecutionId bulunamadıysa veya verilmediyse, arama yap
                    if (currentGroupExecution == null)
                    {
                        if (!string.IsNullOrEmpty(resolvedGroupId))
                        {
                            // Önce aktif group execution'ı bul (EndTime null olan)
                            currentGroupExecution = await historyService.GetActiveGroupExecutionTodayAsync(resolvedGroupId);
                            
                            // Aktif yoksa, bugün başlamış en son group execution'ı bul
                            if (currentGroupExecution == null)
                            {
                                currentGroupExecution = await historyService.GetLatestGroupExecutionTodayAsync(resolvedGroupId);
                            }
                        }
                        else
                        {
                            // GroupId yoksa, assignment'tan bul
                            var data = await _dataService.GetDataAsync();
                            var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId);
                            if (assignment != null)
                            {
                                resolvedGroupId = assignment.GroupId;
                                currentGroupExecution = await historyService.GetActiveGroupExecutionTodayAsync(resolvedGroupId);
                                if (currentGroupExecution == null)
                                {
                                    currentGroupExecution = await historyService.GetLatestGroupExecutionTodayAsync(resolvedGroupId);
                                }
                            }
                        }
                    }
                    
                    // ÖNEMLİ: Eğer birden fazla group execution varsa, en son başlatılan group execution içindeki 
                    // task execution'ı bulmalıyız. Bunun için önce tüm bugün başlamış group execution'ları bulalım
                    // ve en son başlatılan içindeki task execution'ı seçelim.
                    if (currentGroupExecution != null)
                    {
                        completedTaskGroupExecutionId = currentGroupExecution.Id;
                        AddLog($"[MarkTaskAsSuccessAsync] Current GroupExecution found: {currentGroupExecution.Id}, GroupId: {currentGroupExecution.GroupId}, StartTime: {currentGroupExecution.StartTime}");
                        
                        // Şimdi bu group execution içindeki task execution'ı bul
                        // ÖNEMLİ: Sadece bu group execution içinde arama yap, başka hiçbir yerde arama yapma!
                        AddLog($"[MarkTaskAsSuccessAsync] Searching for task execution in GroupExecution {currentGroupExecution.Id} for TaskItemId {taskItemId}");
                        
                        // Önce aktif olanı bul (EndTime null)
                        executionToMark = await dbContext.TaskExecutionHistories
                            .Where(e => e.TaskItemId == taskItemId && 
                                       e.GroupExecutionId == currentGroupExecution.Id &&
                                       e.EndTime == null)
                            .OrderByDescending(e => e.StartTime)
                            .FirstOrDefaultAsync();
                        
                        if (executionToMark != null)
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] Found active task execution (EndTime=null): {executionToMark.Id}");
                        }
                        
                        // Aktif yoksa, bu group execution içindeki en son execution'ı bul (Failed task'lar için)
                        if (executionToMark == null)
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] No active execution found, searching for latest in GroupExecution {currentGroupExecution.Id}");
                            executionToMark = await dbContext.TaskExecutionHistories
                                .Where(e => e.TaskItemId == taskItemId && 
                                           e.GroupExecutionId == currentGroupExecution.Id)
                                .OrderByDescending(e => e.EndTime ?? e.StartTime)
                                .ThenByDescending(e => e.StartTime)
                                .FirstOrDefaultAsync();
                            
                            if (executionToMark != null)
                            {
                                AddLog($"[MarkTaskAsSuccessAsync] Found latest task execution: {executionToMark.Id}");
                            }
                        }
                        
                        if (executionToMark != null)
                        {
                            resolvedGroupId = executionToMark.GroupId;
                            AddLog($"[MarkTaskAsSuccessAsync] ========== TASK EXECUTION FOUND ==========");
                            AddLog($"[MarkTaskAsSuccessAsync] Execution Id: {executionToMark.Id}");
                            AddLog($"[MarkTaskAsSuccessAsync] TaskItemId: {executionToMark.TaskItemId}");
                            AddLog($"[MarkTaskAsSuccessAsync] GroupId: {executionToMark.GroupId}");
                            AddLog($"[MarkTaskAsSuccessAsync] GroupExecutionId: {executionToMark.GroupExecutionId}");
                            AddLog($"[MarkTaskAsSuccessAsync] StartTime: {executionToMark.StartTime}");
                            AddLog($"[MarkTaskAsSuccessAsync] EndTime: {executionToMark.EndTime}");
                            AddLog($"[MarkTaskAsSuccessAsync] FinalStatus: {executionToMark.FinalStatus}");
                            
                            // ÖNEMLİ: GroupExecutionId kontrolü - eğer eşleşmiyorsa hata ver
                            if (executionToMark.GroupExecutionId != currentGroupExecution.Id)
                            {
                                AddLog($"[MarkTaskAsSuccessAsync] ERROR: Execution GroupExecutionId ({executionToMark.GroupExecutionId}) does not match provided GroupExecutionId ({currentGroupExecution.Id})!");
                                AddLog($"[MarkTaskAsSuccessAsync] This should never happen - aborting!");
                                executionToMark = null;
                            }
                        }
                        else
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] No task execution found in GroupExecution {currentGroupExecution.Id} for TaskItemId {taskItemId}");
                            // ÖNEMLİ: groupExecutionId verildiyse, sadece o group execution içinde arama yapmalıyız
                            // Başka bir yerde arama yapmamalıyız çünkü bu yanlış execution'ı bulabilir
                            if (!string.IsNullOrEmpty(groupExecutionId))
                            {
                                AddLog($"[MarkTaskAsSuccessAsync] GroupExecutionId was provided ({groupExecutionId}), but no task execution found. Will not search in other group executions.");
                            }
                        }
                    }
                    else
                    {
                        // currentGroupExecution null ise ve groupExecutionId verilmediyse, arama yap
                        if (string.IsNullOrEmpty(groupExecutionId))
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] No current GroupExecution found for GroupId: {resolvedGroupId}, and no groupExecutionId provided. Searching...");
                            
                            // Group execution bulunamadıysa, direkt olarak task execution'ı bul (geriye uyumluluk)
                            // Ama bu durumda en son başlatılan group execution içindeki execution'ı bulmalıyız
                            if (!string.IsNullOrEmpty(resolvedGroupId))
                            {
                                var todayStart = DateTime.Now.Date;
                                var todayEnd = todayStart.AddDays(1);
                                
                                // Önce bugün başlamış tüm group execution'ları bul ve en son olanı seç
                                var allGroupExecutions = await dbContext.GroupExecutionHistories
                                    .Where(e => e.GroupId == resolvedGroupId && 
                                               e.StartTime >= todayStart && 
                                               e.StartTime < todayEnd)
                                    .OrderByDescending(e => e.StartTime)
                                    .ToListAsync();
                                
                                if (allGroupExecutions.Any())
                                {
                                    // En son başlatılan group execution'ı seç
                                    var latestGroupExecution = allGroupExecutions.First();
                                    completedTaskGroupExecutionId = latestGroupExecution.Id;
                                    AddLog($"[MarkTaskAsSuccessAsync] Found {allGroupExecutions.Count} group executions, using latest: {latestGroupExecution.Id}, StartTime: {latestGroupExecution.StartTime}");
                                    
                                    // Bu group execution içindeki task execution'ı bul
                                    executionToMark = await dbContext.TaskExecutionHistories
                                        .Where(e => e.TaskItemId == taskItemId && 
                                                   e.GroupExecutionId == latestGroupExecution.Id)
                                        .OrderByDescending(e => e.EndTime ?? e.StartTime)
                                        .ThenByDescending(e => e.StartTime)
                                        .FirstOrDefaultAsync();
                                    
                                    if (executionToMark != null)
                                    {
                                        AddLog($"[MarkTaskAsSuccessAsync] Task execution found in latest GroupExecution {latestGroupExecution.Id}: {executionToMark.Id}, StartTime: {executionToMark.StartTime}, EndTime: {executionToMark.EndTime}, FinalStatus: {executionToMark.FinalStatus}");
                                    }
                                }
                            }
                        }
                        else
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] GroupExecutionId was provided ({groupExecutionId}) but not found. Cannot proceed.");
                        }
                    }
                }
            }
            
            if (executionToMark != null)
            {
                AddLog($"[MarkTaskAsSuccessAsync] executionToMark found: {executionToMark.Id}");
                completedTaskGroupExecutionId = executionToMark.GroupExecutionId;
                
                // ÖNCE: executionToMark'ın mevcut değerlerini logla
                AddLog($"[MarkTaskAsSuccessAsync] ========== BEFORE UPDATE ==========");
                AddLog($"  Id: {executionToMark.Id}");
                AddLog($"  TaskItemId: {executionToMark.TaskItemId}");
                AddLog($"  GroupId: {executionToMark.GroupId}");
                AddLog($"  GroupExecutionId: {executionToMark.GroupExecutionId}");
                AddLog($"  StartTime: {executionToMark.StartTime}");
                AddLog($"  EndTime: {executionToMark.EndTime}");
                AddLog($"  FinalStatus: {executionToMark.FinalStatus}");
                AddLog($"  Progress: {executionToMark.Progress}");
                AddLog($"  ErrorMessage: {executionToMark.ErrorMessage}");
                AddLog($"  ErrorCount: {executionToMark.ErrorCount}");
                
                // MarkedAsSuccess statüsünü set et
                try
                {
                    // ÖNEMLİ: executionToMark farklı bir DbContext'ten geliyor olabilir
                    // Bu yüzden ID'yi kullanarak yeni bir query yapalım veya doğrudan güncelleyelim
                    var historyServiceImpl = _executionHistoryService as ExecutionHistoryService;
                    var dbContext = historyServiceImpl?.GetDbContextPublic();
                    if (dbContext != null)
                    {
                        // Execution'ı tekrar bul (aynı context'te)
                        var executionToUpdate = await dbContext.TaskExecutionHistories
                            .FirstOrDefaultAsync(e => e.Id == executionToMark.Id);
                        
                        if (executionToUpdate != null)
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] Execution found in database, updating...");
                            AddLog($"[MarkTaskAsSuccessAsync] BEFORE UPDATE in DB - FinalStatus: {executionToUpdate.FinalStatus}, EndTime: {executionToUpdate.EndTime}");
                            
                            executionToUpdate.EndTime = DateTime.Now;
                            executionToUpdate.FinalStatus = TaskItemStatus.MarkedAsSuccess;
                            executionToUpdate.Progress = 100;
                            executionToUpdate.ErrorMessage = null;
                            
                            var saveResult = await dbContext.SaveChangesAsync();
                            AddLog($"[MarkTaskAsSuccessAsync] SaveChangesAsync result: {saveResult} changes saved");
                            
                            // Güncellemeden SONRA değerleri tekrar oku ve logla
                            await dbContext.Entry(executionToUpdate).ReloadAsync();
                            AddLog($"[MarkTaskAsSuccessAsync] ========== AFTER UPDATE ==========");
                            AddLog($"[MarkTaskAsSuccessAsync] AFTER UPDATE in DB - FinalStatus: {executionToUpdate.FinalStatus}, EndTime: {executionToUpdate.EndTime}");
                            AddLog($"[MarkTaskAsSuccessAsync] AFTER UPDATE - All Execution Details:");
                            AddLog($"  Id: {executionToUpdate.Id}");
                            AddLog($"  TaskItemId: {executionToUpdate.TaskItemId}");
                            AddLog($"  GroupId: {executionToUpdate.GroupId}");
                            AddLog($"  GroupExecutionId: {executionToUpdate.GroupExecutionId}");
                            AddLog($"  StartTime: {executionToUpdate.StartTime}");
                            AddLog($"  EndTime: {executionToUpdate.EndTime}");
                            AddLog($"  FinalStatus: {executionToUpdate.FinalStatus}");
                            AddLog($"  Progress: {executionToUpdate.Progress}");
                            AddLog($"  ErrorMessage: {executionToUpdate.ErrorMessage}");
                            AddLog($"  ErrorCount: {executionToUpdate.ErrorCount}");
                        }
                        else
                        {
                            AddLog($"[MarkTaskAsSuccessAsync] Execution {executionToMark.Id} not found in database");
                            // Fallback: CompleteTaskExecutionAsync'i kullan
                            await _executionHistoryService.CompleteTaskExecutionAsync(executionToMark.Id, TaskItemStatus.MarkedAsSuccess, 100);
                        }
                    }
                    else
                    {
                        AddLog($"[MarkTaskAsSuccessAsync] DbContext is null, using JSON mode");
                        // JSON modunda
                        await _executionHistoryService.CompleteTaskExecutionAsync(executionToMark.Id, TaskItemStatus.MarkedAsSuccess, 100);
                    }
                }
                catch (Exception ex)
                {
                    AddLog($"[MarkTaskAsSuccessAsync] Error marking execution as success: {ex.Message}");
                    AddLog($"[MarkTaskAsSuccessAsync] StackTrace: {ex.StackTrace}");
                    throw;
                }
            }
            else if (!string.IsNullOrEmpty(resolvedGroupId))
            {
                // Execution bulunamadı ama groupId var, yeni bir MarkedAsSuccess execution oluştur
                // Bugünün group execution'ını bul
                var latestGroupExecution = await _executionHistoryService.GetLatestGroupExecutionTodayAsync(resolvedGroupId);
                if (latestGroupExecution != null)
                {
                    completedTaskGroupExecutionId = latestGroupExecution.Id;
                    // Yeni bir MarkedAsSuccess execution oluştur
                    var data = await _dataService.GetDataAsync();
                    var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == resolvedGroupId);
                    var parameterValues = assignment?.TaskParameterValues ?? new Dictionary<string, string?>();
                    
                    var flowItemId = latestGroupExecution.FlowItemId;
                    var flowItemExecutionId = latestGroupExecution.FlowItemExecutionId;
                    
                    var newExecution = await _executionHistoryService.StartTaskExecutionAsync(taskItemId, resolvedGroupId, completedTaskGroupExecutionId, flowItemId, flowItemExecutionId, parameterValues);
                    await _executionHistoryService.CompleteTaskExecutionAsync(newExecution.Id, TaskItemStatus.MarkedAsSuccess, 100);
                }
            }

            // GroupTaskAssignment durumunu güncelle
        if (!string.IsNullOrEmpty(resolvedGroupId))
        {
            await UpdateTaskStatusInAssignmentAsync(taskItemId, resolvedGroupId, assignment =>
            {
                assignment.Status = TaskItemStatus.MarkedAsSuccess;
                assignment.EndTime = DateTime.Now;
                assignment.Progress = 100;
                assignment.ErrorMessage = null;
            }, logStatusChange: true);
        }
        else
        {
            // GroupId hala null ise, tüm assignment'ları güncelle (geriye uyumluluk)
            var data = await _dataService.GetDataAsync();
            var assignments = data.GroupTaskAssignments.Where(a => a.TaskItemId == taskItemId).ToList();
            foreach (var assignment in assignments)
            {
                assignment.Status = TaskItemStatus.MarkedAsSuccess;
                assignment.EndTime = DateTime.Now;
                assignment.Progress = 100;
                assignment.ErrorMessage = null;
                assignment.UpdatedAt = DateTime.Now;
                await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
            }
        }

            // Bu task item'ın tamamlanması, bağımlı task itemları kontrol etmek için tetiklenir
            await CheckAndUpdateTaskItemStatusesAsync();
            
            // Tamamlanan task'ı önşart olarak kullanan bağımlı task'ları başlat
            // ÖNEMLİ: Tamamlanan task'ın group execution ID'sini geçir
            AddLog($"[MarkTaskAsSuccessAsync] Starting dependent tasks for taskItemId: {taskItemId}, groupId: {resolvedGroupId}, groupExecutionId: {completedTaskGroupExecutionId}");
            await StartDependentTasksAsync(taskItemId, resolvedGroupId, completedTaskGroupExecutionId);

            AddLog($"[MarkTaskAsSuccessAsync] END - Returning true");
            return true;
        }
        catch (Exception ex)
        {
            var errorLog = $"[MarkTaskAsSuccessAsync] Exception: {ex.Message}";
            var stackLog = $"[MarkTaskAsSuccessAsync] StackTrace: {ex.StackTrace}";
            System.Diagnostics.Debug.WriteLine(errorLog);
            Console.WriteLine(errorLog);
            System.Diagnostics.Debug.WriteLine(stackLog);
            Console.WriteLine(stackLog);
            System.Console.Out.Flush();
            debugLogs?.Add(errorLog);
            debugLogs?.Add(stackLog);
            return false;
        }
    }

    public async Task<bool> FailTaskItemAsync(string taskItemId, string errorMessage, string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        // GroupTaskAssignment durumunu güncelle
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir ve 
        // farklı gruplardaki aynı task'ın durumlarını birbirinden bağımsız tutmak için
        // sadece GroupTaskAssignment durumunu kullanıyoruz
        await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
        {
            assignment.Status = TaskItemStatus.Failed;
            assignment.LastErrorTime = DateTime.Now;
            assignment.ErrorMessage = errorMessage;
        }, logStatusChange: true);

        // Execution history'ye hata ekle
        var historyService = _executionHistoryService as ExecutionHistoryService;
        string? failedExecutionId = null;
        if (historyService != null)
        {
            var activeExecution = await historyService.GetActiveTaskExecutionAsync(taskItemId);
            if (activeExecution != null)
            {
                failedExecutionId = activeExecution.Id;
                Console.WriteLine($"[FailTaskItemAsync] Active execution found: {activeExecution.Id}, StartTime: {activeExecution.StartTime}, TaskItemId: {taskItemId}, GroupId: {groupId}");
                
                // ÖNEMLİ: Her durumda execution'ı Failed olarak işaretle (retry mekanizması için)
                // IncrementTaskErrorCountAsync sadece error count'u artırır, status'u Failed yapmaz
                // Bu yüzden her zaman FailTaskExecutionAsync çağrılmalı
                Console.WriteLine($"[FailTaskItemAsync] Marking execution {activeExecution.Id} as Failed");
                await _executionHistoryService.FailTaskExecutionAsync(activeExecution.Id, errorMessage);
                
                // Eğer task daha önce başlamışsa hata sayısını da artır
                if (activeExecution.StartTime < DateTime.Now.AddMinutes(-1)) // En az 1 dakika çalışmışsa
                {
                    Console.WriteLine($"[FailTaskItemAsync] Task ran for more than 1 minute, also incrementing error count");
                    // Error count zaten FailTaskExecutionAsync içinde artırılıyor, bu yüzden tekrar artırmaya gerek yok
                }
            }
            else
            {
            }
        }

        // Retry mekanizması: Belirli süre sonra WaitingRetry durumuna geç
        // ÖNEMLİ: RetryIntervalMinutes kullanılıyor (Kaç dakikada bir tekrar çalışması gerektiği)
        _ = Task.Run(async () =>
        {
            try
            {
                // RetryIntervalMinutes kullan (kullanıcının ayarladığı değer)
                var retryDelay = taskItem.RetryIntervalMinutes > 0 ? taskItem.RetryIntervalMinutes : taskItem.RetryDelayMinutes;
                await Task.Delay(TimeSpan.FromMinutes(retryDelay));
                
                // TaskExecutionHistory'den bugünün execution'ını bul ve WaitingRetry olarak işaretle
                var historyService2 = _executionHistoryService as ExecutionHistoryService;
                if (historyService2 != null)
                {
                    var dbContext = historyService2.GetDbContextPublic();
                    if (dbContext != null)
                    {
                        var today = DateTime.Now.Date;
                        
                        // Önce failedExecutionId ile dene (eğer varsa)
                        TaskExecutionHistory? todayExecution = null;
                        if (!string.IsNullOrEmpty(failedExecutionId))
                        {
                            todayExecution = await dbContext.TaskExecutionHistories
                                .FirstOrDefaultAsync(e => e.Id == failedExecutionId);
                        }
                        
                        // Eğer bulunamadıysa, bugünün en son execution'ını bul
                        if (todayExecution == null)
                        {
                            todayExecution = await dbContext.TaskExecutionHistories
                                .Where(e => e.TaskItemId == taskItemId && 
                                       (string.IsNullOrEmpty(groupId) || e.GroupId == groupId) &&
                                       e.StartTime.Date == today)
                                .OrderByDescending(e => e.StartTime)
                                .FirstOrDefaultAsync();
                        }
                        
                        if (todayExecution != null && todayExecution.FinalStatus == TaskItemStatus.Failed)
                        {
                            Console.WriteLine($"[FailTaskItemAsync] Retry Logic Check -> Task: {taskItem.Name} ({taskItemId})");
                            Console.WriteLine($"[FailTaskItemAsync] ExecutionId: {todayExecution.Id}");
                            Console.WriteLine($"[FailTaskItemAsync] Current RetryCount: {todayExecution.RetryCount}");
                            Console.WriteLine($"[FailTaskItemAsync] MaxRetryCount: {taskItem.MaxRetryCount}");
                            Console.WriteLine($"[FailTaskItemAsync] ErrorCount: {todayExecution.ErrorCount}");

                            // RetryCount kontrolü: MaxRetryCount'tan fazla retry varsa tekrar çalıştırma
                            if (todayExecution.RetryCount >= taskItem.MaxRetryCount)
                            {
                                Console.WriteLine($"[FailTaskItemAsync] Max retry limit reached ({taskItem.MaxRetryCount}). Stopping retry mechanism.");
                                return; // Retry mekanizmasını durdur
                            }
                            
                            Console.WriteLine($"[FailTaskItemAsync] Scheduling next retry (Wait and set to WaitingRetry)...");
                            await _executionHistoryService.UpdateTaskExecutionStatusAsync(todayExecution.Id, TaskItemStatus.WaitingRetry);
                            
                            // ÖNEMLİ: GroupTaskAssignment'ı da WaitingRetry olarak güncelle
                            await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
                            {
                                assignment.Status = TaskItemStatus.WaitingRetry;
                                assignment.UpdatedAt = DateTime.Now;
                            }, logStatusChange: true);
                            
                            // CheckAndUpdateTaskItemStatusesAsync'i tetikle (retry'yi hemen kontrol et)
                            try
                            {
                                await CheckAndUpdateTaskItemStatusesAsync();
                            }
                            catch
                            {
                                // Hata durumunda sessizce devam et
                            }
                        }
                    }
                }
            }
            catch
            {
                // Hata durumunda sessizce devam et
            }
        });

        return true;
    }

    public async Task UpdateTaskItemProgressAsync(string taskItemId, int progress, string? groupId = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return;
        }
        
        // TaskExecutionHistory'den bugünün execution'ını kontrol et
        var historyService = _executionHistoryService as ExecutionHistoryService;
        bool isRunning = false;
        if (historyService != null)
        {
            var dbContext = historyService.GetDbContextPublic();
            if (dbContext != null)
            {
                var today = DateTime.Now.Date;
                var todayExecution = await dbContext.TaskExecutionHistories
                    .Where(e => e.TaskItemId == taskItemId && 
                               (string.IsNullOrEmpty(groupId) || e.GroupId == groupId) &&
                               e.StartTime.Date == today)
                    .OrderByDescending(e => e.StartTime)
                    .FirstOrDefaultAsync();
                
                isRunning = todayExecution != null && todayExecution.FinalStatus == TaskItemStatus.Running;
            }
        }
        
        if (!isRunning)
        {
            return;
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);

        // GroupTaskAssignment progress'ini güncelle
        // NOT: TaskItem progress'ini güncellemiyoruz çünkü TaskItem global bir entity'dir ve 
        // farklı gruplardaki aynı task'ın progress'lerini birbirinden bağımsız tutmak için
        // sadece GroupTaskAssignment progress'ini kullanıyoruz
        await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
        {
            assignment.Progress = Math.Clamp(progress, 0, 100);
        });
    }

    public async Task CheckAndUpdateTaskItemStatusesAsync()
    {
        var data = await _dataService.GetDataAsync();
        var completedTasks = new List<(string taskId, string groupId)>();
        var waitingRetryTasks = new List<(string taskId, string taskName, string groupId, string groupName)>();
        
        var historyService = _executionHistoryService as ExecutionHistoryService;
        if (historyService == null) return;

        // 1. Tüm AKTİF grup yürütmelerini al (farklı akışlardakiler dahil)
        var activeGroupExecutions = await historyService.GetAllActiveGroupExecutionsAsync();
        
        // 2. Bugün başlamış tüm yürütmeleri topla
        var today = DateTime.Now.Date;
        var allRecentExecutions = new List<GroupExecutionHistory>(activeGroupExecutions);
        
        foreach (var group in data.Groups)
        {
            var latestToday = await _executionHistoryService.GetLatestGroupExecutionTodayAsync(group.Id);
            if (latestToday != null && !allRecentExecutions.Any(e => e.Id == latestToday.Id))
            {
                allRecentExecutions.Add(latestToday);
            }
        }

        // OPTİMİZASYON: Günün tüm Flow ve Task geçmişini tek seferde çek
        var todayFlowExecutions = await _executionHistoryService.GetFlowExecutionHistoriesAsync(startDate: today);
        var todayTaskExecutions = await _executionHistoryService.GetTaskExecutionHistoriesAsync(startDate: today);
        
        // Bellekte hızlı arama için mapping'ler oluştur
        var flowExecMap = todayFlowExecutions.ToDictionary(e => e.Id);
        var activeFlowMap = todayFlowExecutions
            .Where(e => e.EndTime == null)
            .GroupBy(e => e.FlowItemId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(e => e.StartTime).First());

        var taskExecByGroupExec = todayTaskExecutions
            .GroupBy(e => e.GroupExecutionId ?? "none")
            .ToDictionary(g => g.Key, g => g.ToList());

        // her yürütmeyi BAĞIMSIZ olarak değerlendir
        // ÖNEMLİ: Sadece her akışın EN SON aktif flow execution'ına bağlı olanları işle
        var latestFlowExecutions = new Dictionary<string, string>(); // FlowItemId -> LatestFlowExecutionId
        
        foreach (var groupExec in allRecentExecutions)
        {
            if (!string.IsNullOrEmpty(groupExec.FlowItemExecutionId))
            {
                if (flowExecMap.TryGetValue(groupExec.FlowItemExecutionId, out var flowExec))
                {
                    if (activeFlowMap.TryGetValue(flowExec.FlowItemId, out var latestActiveFlow))
                    {
                        // Eğer bu grup execution, akışın EN SON çalışmasına ait değilse ATLA
                        if (groupExec.FlowItemExecutionId != latestActiveFlow.Id)
                        {
                            continue;
                        }
                    }
                }
            }

            var groupId = groupExec.GroupId;
            var group = data.Groups.FirstOrDefault(g => g.Id == groupId);
            if (group == null) continue;

            // Bu yürütmeye özel task statülerini bellekten al
            var contextStatuses = new Dictionary<string, TaskItemStatus>();
            if (taskExecByGroupExec.TryGetValue(groupExec.Id, out var groupTasks))
            {
                foreach (var taskExec in groupTasks.OrderByDescending(e => e.StartTime))
                {
                    var key = $"{groupId}-{taskExec.TaskItemId}";
                    if (!contextStatuses.ContainsKey(key))
                    {
                        contextStatuses[key] = taskExec.FinalStatus;
                    }
                }
            }
            
            // Eğer flowId bazlı filtreleme gerekiyorsa (GetTodayTaskStatusesByGroupAsync'in flowExecutionId parametresi gibi)
            // burada zaten groupExec.Id üzerinden filtrelediğimiz için flowExecutionId'ye gerek kalmıyor 
            // çünkü her group execution bir flow execution'a bağlıdır.
            
            // Bu grubun task assignment'larını al
            var groupAssignments = data.GroupTaskAssignments.Where(a => a.GroupId == groupId).ToList();
            
            foreach (var assignment in groupAssignments)
            {
                var taskItem = await _dataService.GetTaskItemAsync(assignment.TaskItemId);
                if (taskItem == null) continue;

                var taskKey = $"{groupId}-{assignment.TaskItemId}";
                var status = contextStatuses.ContainsKey(taskKey) ? contextStatuses[taskKey] : TaskItemStatus.Pending;
                
                // 1. TIMEOUT KONTROLÜ (Sadece Running ise)
                if (status == TaskItemStatus.Running)
                {
                    // Bellekten bu grubun task'larını bulup start time kontrol et
                    TaskExecutionHistory? latestTaskExec = null;
                    if (taskExecByGroupExec.TryGetValue(groupExec.Id, out var groupTasksForTimeout))
                    {
                        latestTaskExec = groupTasksForTimeout
                            .Where(e => e.TaskItemId == taskItem.Id && e.EndTime == null)
                            .OrderByDescending(e => e.StartTime)
                            .FirstOrDefault();
                    }
                    
                    if (latestTaskExec != null)
                    {
                        var timeoutMinutes = taskItem.TimeoutMinutes > 0 ? taskItem.TimeoutMinutes : 720;
                        var runningTime = DateTime.Now - latestTaskExec.StartTime;
                        
                        if (runningTime.TotalMinutes > timeoutMinutes)
                        {
                            Console.WriteLine($"[Timeout] Task {taskItem.Name} in Exec {groupExec.Id} timed out.");
                            await FailTaskItemAsync(taskItem.Id, $"Task timed out after {runningTime.TotalMinutes:F1} minutes.", groupId);
                            continue;
                        }
                    }
                }

                // 2. RETRY KONTROLÜ (Sadece Failed ise)
                if (status == TaskItemStatus.Failed)
                {
                    var retryDelay = taskItem.RetryIntervalMinutes > 0 ? taskItem.RetryIntervalMinutes : taskItem.RetryDelayMinutes;
                    if (retryDelay > 0)
                    {
                        TaskExecutionHistory? latestFailed = null;
                        if (taskExecByGroupExec.TryGetValue(groupExec.Id, out var groupTasksForRetry))
                        {
                            latestFailed = groupTasksForRetry
                                .Where(e => e.TaskItemId == taskItem.Id && e.FinalStatus == TaskItemStatus.Failed)
                                .OrderByDescending(e => e.StartTime)
                                .FirstOrDefault();
                        }
                        
                        if (latestFailed != null && latestFailed.EndTime.HasValue)
                        {
                            var timeSinceError = DateTime.Now - latestFailed.EndTime.Value;
                            if (timeSinceError.TotalMinutes >= retryDelay && latestFailed.RetryCount < taskItem.MaxRetryCount)
                            {
                                Console.WriteLine($"[STATUS] Task '{taskItem.Name}' in Exec {groupExec.Id} -> WaitingRetry (Retry {latestFailed.RetryCount + 1})");
                                await _executionHistoryService.UpdateTaskExecutionStatusAsync(latestFailed.Id, TaskItemStatus.WaitingRetry);
                                
                                // Global assignment statüsünü de güncelle (UI için)
                                assignment.Status = TaskItemStatus.WaitingRetry;
                                assignment.UpdatedAt = DateTime.Now;
                                await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
                                status = TaskItemStatus.WaitingRetry;
                            }
                        }
                    }
                }

                // 3. START READY TASKS (Pending veya WaitingRetry ise)
                if (status == TaskItemStatus.Pending || status == TaskItemStatus.WaitingRetry)
                {
                    if (_processingTaskIds.ContainsKey(taskItem.Id)) continue;

                    // Bu yürütme bağlamında başlayabilir mi?
                    // CanStartTaskItemAsync metodunu context-aware yapamadık henüz, ama manuel kontrol ekleyelim
                    bool allPrereqsMet = true;
                    foreach (var prereqId in assignment.PrerequisiteTaskItemIds)
                    {
                        var prereqKey = $"{groupId}-{prereqId}";
                        var prereqStatus = contextStatuses.ContainsKey(prereqKey) ? contextStatuses[prereqKey] : TaskItemStatus.Pending;
                        if (prereqStatus != TaskItemStatus.Completed && prereqStatus != TaskItemStatus.MarkedAsSuccess)
                        {
                            allPrereqsMet = false;
                            break;
                        }
                    }

                    if (allPrereqsMet)
                    {
                        Console.WriteLine($"[STATUS] Task '{taskItem.Name}' in Exec {groupExec.Id} -> Ready/Starting");
                        
                        if (_processingTaskIds.TryAdd(taskItem.Id, 0))
                        {
                            try
                            {
                                // StartTaskItem specifik execution id almalı!
                                await StartTaskItemAsync(taskItem.Id, groupId, skipCanStartCheck: true, 
                                    flowItemId: groupExec.FlowItemId, 
                                    flowItemExecutionId: groupExec.FlowItemExecutionId,
                                    groupExecutionId: groupExec.Id);
                                
                                // assignment.Status'u UI için güncelle
                                assignment.Status = TaskItemStatus.Running;
                                await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
                            }
                            finally
                            {
                                _processingTaskIds.TryRemove(taskItem.Id, out _);
                            }
                        }
                    }
                }
            }
        }
        // 3. Grup execution history'lerini kontrol et ve tamamlananları güncelle
        await CheckAndCompleteGroupExecutionsAsync();
        
        // 4. Akış execution history'lerini kontrol et ve tamamlananları güncelle
        await CheckAndCompleteFlowExecutionsAsync();
        
        Console.WriteLine($"[CheckAndUpdateTaskItemStatusesAsync] ========== END ========== Time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
    }
    
    /// <summary>
    /// Aktif grup execution'larını kontrol et ve tamamlananları güncelle
    /// </summary>
    private async Task CheckAndCompleteGroupExecutionsAsync()
    {
        try
        {
            var data = await _dataService.GetDataAsync();
            var historyService = _executionHistoryService as ExecutionHistoryService;
            if (historyService == null) return;
            
            // Tüm aktif grup execution'larını al
            var activeGroupExecutions = await historyService.GetAllActiveGroupExecutionsAsync();
            
            foreach (var activeGroupExecution in activeGroupExecutions)
            {
                try
                {
                    var group = data.Groups.FirstOrDefault(g => g.Id == activeGroupExecution.GroupId);
                    if (group == null) continue;
                    
                    // Grubun task assignment'larını al
                    var assignments = await _dataService.GetGroupTaskAssignmentsAsync(group.Id);
                    if (assignments.Count == 0) continue;
                    
                    int totalTasks = assignments.Count;
                    int completedTasks = 0;
                    int failedTasks = 0;
                    int totalErrors = 0;
                    int markedAsSuccessTasks = 0;
                    bool hasWaitingRetryTasks = false;
                    
                    // Her task'ın durumunu kontrol et
                    var dbContext = historyService.GetDbContextPublic();
                    var today = DateTime.Now.Date; // today değişkenini döngü dışında tanımla
                    foreach (var assignment in assignments)
                    {
                        try
                        {
                            var taskItem = data.TaskItems.FirstOrDefault(t => t.Id == assignment.TaskItemId);
                            if (taskItem == null) continue;

                            // 1. TaskExecutionHistory'den bu grup çalışmasına ait execution'ı bul
                            TaskExecutionHistory? todayExecution = null;
                            if (dbContext != null)
                            {
                                todayExecution = await dbContext.TaskExecutionHistories
                                    .Where(e => e.TaskItemId == assignment.TaskItemId && 
                                               e.GroupId == group.Id && 
                                               e.GroupExecutionId == activeGroupExecution.Id)
                                    .OrderByDescending(e => e.StartTime)
                                    .FirstOrDefaultAsync();
                            }
                            else
                            {
                                var taskHistories = await _executionHistoryService.GetTaskExecutionHistoriesAsync(
                                    taskItemId: assignment.TaskItemId,
                                    groupId: group.Id,
                                    startDate: activeGroupExecution.StartTime
                                );
                                todayExecution = taskHistories
                                    .Where(e => e.GroupExecutionId == activeGroupExecution.Id)
                                    .OrderByDescending(e => e.StartTime)
                                    .FirstOrDefault();
                            }

                            if (todayExecution != null)
                            {
                                totalErrors += todayExecution.ErrorCount;
                            }

                            // 2. Durum Belirleme ve Metrik Sayımı
                            // ÖNEMLİ: Bu execution'a özel durumu kontrol et
                            TaskItemStatus currentStatus;
                            if (todayExecution != null)
                            {
                                // Bu execution'da task çalışmış, durumu execution'dan al
                                currentStatus = todayExecution.FinalStatus;
                            }
                            else
                            {
                                // Bu execution'da task henüz çalışmamış = Pending
                                // Bu durum grubun bitmemiş olduğu anlamına gelir
                                currentStatus = TaskItemStatus.Pending;
                            }

                            if (currentStatus == TaskItemStatus.Completed)
                            {
                                completedTasks++;
                            }
                            else if (currentStatus == TaskItemStatus.MarkedAsSuccess)
                            {
                                completedTasks++;
                                markedAsSuccessTasks++;
                            }
                            else if (currentStatus == TaskItemStatus.Failed || currentStatus == TaskItemStatus.WaitingRetry)
                            {
                                // Retry kontrolü
                                bool canRetry = false;
                                if (taskItem.MaxRetryCount > 0)
                                {
                                    int retryCount = todayExecution?.RetryCount ?? 0;
                                    if (retryCount < taskItem.MaxRetryCount)
                                    {
                                        canRetry = true;
                                    }
                                }

                                if (canRetry)
                                {
                                    hasWaitingRetryTasks = true;
                                    // TALEBE İSTİNADEN: WaitingRetry durumundakiler de 'failedTasks' olarak sayılsın (metrik için)
                                    failedTasks++; 
                                    Console.WriteLine($"[CheckAndCompleteGroup] Task '{taskItem.Name}' is currently {currentStatus}, waiting for retry { (todayExecution?.RetryCount ?? 0) + 1 }/{taskItem.MaxRetryCount}");
                                }
                                else
                                {
                                    failedTasks++;
                                    Console.WriteLine($"[CheckAndCompleteGroup] Task '{taskItem.Name}' failed and exhausted all {taskItem.MaxRetryCount} retries.");
                                }
                            }
                            else
                            {
                                // Pending, Running, Ready vb.
                                hasWaitingRetryTasks = true;
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[CheckAndCompleteGroup] Error evaluating task {assignment.TaskItemId}: {ex.Message}");
                        }
                    }
                    
                    // ÖNEMLİ: Tüm task'lar tamamlandı mı? 
                    // TALEBE İSTİNADEN: Hata alan bir grup varsa bitiş tarihi almalı.
                    // Bu yüzden hasWaitingRetryTasks kontrolünü bitiş kontrolünden çıkarıyoruz.
                    // Ancak Running task varsa bitmemeli.
                    bool allTasksProcessed = (completedTasks + failedTasks) == totalTasks;
                    bool isActuallyFinished = allTasksProcessed && !hasWaitingRetryTasks;

                    Console.WriteLine($"[CheckAndCompleteGroup] Group '{group.Name}' ({activeGroupExecution.Id}): Total={totalTasks}, Completed={completedTasks}, Failed={failedTasks}, Errors={totalErrors}, Finished={isActuallyFinished}");

                    // metrikleri güncelle
                    await _executionHistoryService.CompleteGroupExecutionAsync(
                        activeGroupExecution.Id,
                        totalTasks,
                        completedTasks,
                        failedTasks,
                        totalErrors,
                        markedAsSuccessTasks,
                        status: isActuallyFinished ? null : TaskItemStatus.Running,
                        isFinished: isActuallyFinished
                    );

                    if (isActuallyFinished)
                    {
                        Console.WriteLine($"[STATUS] Group '{group.Name}' -> Finished (Status: {(failedTasks > 0 ? "Failed" : "Completed")})");
                        
                        // Akış içindeyse bir sonraki grupları tetikle - SADECE BAŞARILIYSA!
                        if (failedTasks == 0 && !string.IsNullOrEmpty(activeGroupExecution.FlowItemExecutionId))
                        {
                            await StartDependentGroupsAsync(group.Id, activeGroupExecution.FlowItemExecutionId);
                        }
                    }
                }
                catch
                {
                    // Hata olsa bile diğer grupları kontrol etmeye devam et
                }
            }
        }
        catch
        {
            // Hata olsa bile metod tamamlanmalı, exception fırlatma
        }
    }

    /// <summary>
    /// Aktif akış execution'larını kontrol et ve tamamlananları güncelle
    /// </summary>
    private async Task CheckAndCompleteFlowExecutionsAsync()
    {
        try
        {
            var historyService = _executionHistoryService as ExecutionHistoryService;
            if (historyService == null) return;

            // Bugün başlamış tüm flow execution'larını al (Aktif olanlar veya Başarısız bitenler)
            var today = DateTime.Now.Date;
            var flowExecutionsForToday = await _executionHistoryService.GetFlowExecutionHistoriesAsync(startDate: today);
            var flowsToProcess = flowExecutionsForToday
                .Where(f => f.EndTime == null || f.Status == "Failed")
                .ToList();

            if (flowsToProcess.Count == 0) return;

            foreach (var flowExec in flowsToProcess)
            {
                try
                {
                    // Bu akışa ait grupları al
                    var assignments = await _dataService.GetFlowGroupAssignmentsAsync(flowExec.FlowItemId);
                    if (assignments.Count == 0) continue;

                    // Tüm grupların bu flow execution bağlamında tamamlanıp tamamlanmadığını kontrol et
                    bool allGroupsFinished = true;
                    bool anyGroupFailed = false;
                    
                    foreach (var assignment in assignments)
                    {
                        // Bu flow execution bazlı en son group execution'ı bul
                        var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(
                            groupId: assignment.GroupId, 
                            flowItemExecutionId: flowExec.Id);
                        
                        var latestGroupExec = groupExecutions.OrderByDescending(e => e.StartTime).FirstOrDefault();
                        
                        // Grup bitmiş mi? (Normal Completed veya MarkedAsSuccess veya Failed)
                        bool isFinished = latestGroupExec != null && 
                                          latestGroupExec.EndTime != null && 
                                          (latestGroupExec.Status == TaskItemStatus.Completed || 
                                           latestGroupExec.Status == TaskItemStatus.MarkedAsSuccess || 
                                           latestGroupExec.Status == TaskItemStatus.Failed);
                        
                        if (!isFinished)
                        {
                            allGroupsFinished = false;
                        }
                        
                        if (latestGroupExec == null || latestGroupExec.Status == TaskItemStatus.Failed)
                        {
                            anyGroupFailed = true;
                        }
                    }

                    if (allGroupsFinished)
                    {
                        // Flow'u tamamla - Başarısız grup varsa Failed olarak kapa
                        string finalStatus = anyGroupFailed ? "Failed" : "Completed";
                        
                        // Eğer zaten Failed ise ve yeni statü yine Failed ise güncellemeye gerek yok
                        if (flowExec.EndTime != null && flowExec.Status == finalStatus)
                        {
                            continue;
                        }

                        await _executionHistoryService.CompleteFlowExecutionAsync(flowExec.Id, finalStatus);
                        Console.WriteLine($"[STATUS] Flow '{flowExec.FlowItemId}' -> Finished ({finalStatus})");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CheckAndCompleteFlowExecutionsAsync] Error processing flow {flowExec.Id}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CheckAndCompleteFlowExecutionsAsync] Error: {ex.Message}");
        }
    }

    

    /// <summary>
    /// Tamamlanan bir task'ı önşart olarak kullanan bağımlı task'ları kontrol edip başlatır
    /// </summary>
    private async Task StartDependentTasksAsync(string completedTaskItemId, string? completedTaskGroupId = null, string? completedTaskGroupExecutionId = null)
    {
        // ÖNEMLİ: Güncel verileri al (cache'lenmiş data yerine)
        var currentDataForLoop = await _dataService.GetDataAsync();
        
        // Tamamlanan task'ın hangi grup(lar)da olduğunu bul - GÜNCEL VERİLERLE
        var completedTaskAssignments = currentDataForLoop.GroupTaskAssignments
            .Where(a => a.TaskItemId == completedTaskItemId)
            .ToList();
        
        // 0. Akış ve Grup çalışma ID'lerini belirle
        string? flowExecutionId = null;
        if (!string.IsNullOrEmpty(completedTaskGroupExecutionId))
        {
            var groupExecution = await _executionHistoryService.GetGroupExecutionHistoryAsync(completedTaskGroupExecutionId);
            if (groupExecution != null)
            {
                flowExecutionId = groupExecution.FlowItemExecutionId;
            }
        }

        // Tüm assignment'ları kontrol et
        foreach (var assignment in currentDataForLoop.GroupTaskAssignments)
        {
            // Bu assignment'ın önşartları arasında tamamlanan task var mı?
            if (assignment.PrerequisiteTaskItemIds != null && 
                assignment.PrerequisiteTaskItemIds.Contains(completedTaskItemId))
            {
                // ... sameGroup kontrolü ...
                bool sameGroup = false;
                if (!string.IsNullOrEmpty(completedTaskGroupId))
                {
                    sameGroup = assignment.GroupId == completedTaskGroupId;
                }
                else
                {
                    var currentCompletedTaskAssignments = currentDataForLoop.GroupTaskAssignments
                        .Where(a => a.TaskItemId == completedTaskItemId)
                        .ToList();
                    sameGroup = currentCompletedTaskAssignments.Any(ca => ca.GroupId == assignment.GroupId);
                }
                
                if (!sameGroup)
                {
                    continue;
                }
                
                var dependentTask = await _dataService.GetTaskItemAsync(assignment.TaskItemId);
                if (dependentTask == null)
                {
                    continue;
                }

                // ÖNEMLİ: Flow/Group Execution ID'lerine göre statüleri al
                var todayStatusesForCheck = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync(
                    groupExecutionId: completedTaskGroupExecutionId,
                    flowItemExecutionId: flowExecutionId);
                
                var dependentTaskKey = $"{assignment.GroupId}-{assignment.TaskItemId}";
                var dependentTaskStatus = todayStatusesForCheck.ContainsKey(dependentTaskKey) 
                    ? todayStatusesForCheck[dependentTaskKey] 
                    : (TaskItemStatus?)null;
                
                // Task zaten başlamış veya tamamlanmışsa atla
                if (dependentTaskStatus == TaskItemStatus.Running || 
                    dependentTaskStatus == TaskItemStatus.Completed ||
                    dependentTaskStatus == TaskItemStatus.Failed)
                {
                    continue;
                }

                // ÖNEMLİ: Eğer bu task'ın önşartı yoksa, atla (zaten StartGroupAsync'de başlatıldı)
                if (assignment.PrerequisiteTaskItemIds == null || assignment.PrerequisiteTaskItemIds.Count == 0)
                {
                    continue;
                }

                // Tüm önşartların tamamlanıp tamamlanmadığını kontrol et (güncel verilerle)
                // ÖNEMLİ: Sadece aynı grup içindeki önşartları kontrol et
                // ÖNEMLİ: Her önşart kontrolünde güncel verileri al (cache'lenmiş data yerine)
                bool allPrerequisitesCompleted = true;
                int checkedPrerequisitesCount = 0;
                
                foreach (var prerequisiteId in assignment.PrerequisiteTaskItemIds)
                {
                    // ÖNEMLİ: Her önşart kontrolünde güncel verileri al (cache'lenmiş data yerine)
                    var currentData = await _dataService.GetDataAsync();
                    
                    // Önşart task'ın bu grupta olup olmadığını kontrol et
                    var prerequisiteAssignment = currentData.GroupTaskAssignments
                        .FirstOrDefault(a => a.TaskItemId == prerequisiteId && a.GroupId == assignment.GroupId);
                    
                    if (prerequisiteAssignment == null)
                    {
                        // Önşart bu grupta yok, bu önşartı görmezden gel (farklı grupta olabilir)
                        continue;
                    }
                    
                    checkedPrerequisitesCount++;
                    
                    // Her önşartı veritabanından güncel olarak al
                    var prerequisite = await _dataService.GetTaskItemAsync(prerequisiteId);
                    if (prerequisite == null)
                    {
                        allPrerequisitesCompleted = false;
                        break;
                    }
                    
                    // ÖNEMLİ: Önşart kontrolü - HER ZAMAN bugünün execution history'lerini kontrol et
                    // Kopyalanan history'ler bugünün tarihine güncellendiği için, bugünün statülerini kontrol etmek en güvenilir yöntem
                    bool prerequisiteCompleted = false;
                    
                    // 1. ÖNCE: Bugünün execution history statülerini kontrol et (en güvenilir)
                    var todayStatuses = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync(
                        groupExecutionId: completedTaskGroupExecutionId,
                        flowItemExecutionId: flowExecutionId);
                    
                    var prerequisiteKey = $"{assignment.GroupId}-{prerequisiteId}";
                    var prerequisiteStatus = todayStatuses.ContainsKey(prerequisiteKey) 
                        ? todayStatuses[prerequisiteKey] 
                        : (TaskItemStatus?)null;
                    
                    prerequisiteCompleted = prerequisiteStatus == TaskItemStatus.Completed || 
                                           prerequisiteStatus == TaskItemStatus.MarkedAsSuccess;
                    
                    // 2. Eğer bugünün statülerinde bulunamadıysa, aynı execution içinde kontrol et
                    if (!prerequisiteCompleted && !string.IsNullOrEmpty(completedTaskGroupExecutionId) && 
                        assignment.GroupId == completedTaskGroupId)
                    {
                        var historyServiceForPrereq = _executionHistoryService as ExecutionHistoryService;
                        if (historyServiceForPrereq != null)
                        {
                            var dbContext = historyServiceForPrereq.GetDbContextPublic();
                            if (dbContext != null)
                            {
                                // Bu group execution'daki prerequisite task'ı bul
                                var prerequisiteExecution = await dbContext.TaskExecutionHistories
                                    .Where(e => e.TaskItemId == prerequisiteId && 
                                               e.GroupId == assignment.GroupId &&
                                               e.GroupExecutionId == completedTaskGroupExecutionId)
                                    .OrderByDescending(e => e.StartTime)
                                    .FirstOrDefaultAsync();
                                
                                prerequisiteCompleted = prerequisiteExecution != null && 
                                                       (prerequisiteExecution.FinalStatus == TaskItemStatus.Completed ||
                                                        prerequisiteExecution.FinalStatus == TaskItemStatus.MarkedAsSuccess);
                            }
                        }
                    }
                    
                    // 3. Son olarak, GroupTaskAssignment durumunu kontrol et (fallback)
                    if (!prerequisiteCompleted)
                    {
                        var currentDataForPrereq = await _dataService.GetDataAsync();
                        var prerequisiteAssignmentFallback = currentDataForPrereq.GroupTaskAssignments
                            .FirstOrDefault(a => a.TaskItemId == prerequisiteId && a.GroupId == assignment.GroupId);
                        
                        prerequisiteCompleted = prerequisiteAssignmentFallback != null && 
                                               (prerequisiteAssignmentFallback.Status == TaskItemStatus.Completed ||
                                                prerequisiteAssignmentFallback.Status == TaskItemStatus.MarkedAsSuccess);
                    }
                    
                    // Prerequisite Completed olmalı (execution history'den)
                    if (!prerequisiteCompleted)
                    {
                        allPrerequisitesCompleted = false;
                        break;
                    }
                }
                
                // Eğer hiç önşart kontrol edilmediyse (tüm önşartlar farklı grupta), task'ı başlatma
                if (checkedPrerequisitesCount == 0)
                {
                    continue;
                }

                // Tüm önşartlar tamamlandıysa ve task başlatılabilir durumdaysa başlat
                if (allPrerequisitesCompleted)
                {
                    // Assignment durumunu tekrar kontrol et (güncel verilerle)
                    var currentData = await _dataService.GetDataAsync();
                    var currentAssignment = currentData.GroupTaskAssignments
                        .FirstOrDefault(a => a.TaskItemId == assignment.TaskItemId && a.GroupId == assignment.GroupId);
                    
                    if (currentAssignment == null)
                    {
                        continue;
                    }
                    
                    // ÖNEMLİ: Execution history'den bugünün statüsünü kontrol et
                    var todayStatusesForStart = await _executionHistoryService.GetTodayTaskStatusesByGroupAsync(
                        groupExecutionId: completedTaskGroupExecutionId,
                        flowItemExecutionId: flowExecutionId);
                    
                    var taskKeyForStart = $"{assignment.GroupId}-{assignment.TaskItemId}";
                    var taskStatusForStart = todayStatusesForStart.ContainsKey(taskKeyForStart) 
                        ? todayStatusesForStart[taskKeyForStart] 
                        : (TaskItemStatus?)null;
                    
                    // Task Pending, Ready veya WaitingRetry durumunda olmalı (execution history'den)
                    // Eğer execution history'de yoksa, assignment'tan kontrol et
                    // ÖNEMLİ: Eğer execution history'de Completed ise, bu task daha önce çalışmış demektir
                    // Ama önşartlar tamamlandığı için, bu task'ı tekrar başlatmak isteyebiliriz
                    // Bu durumda, assignment durumunu kontrol et
                    bool canStart = false;
                    if (taskStatusForStart == null)
                    {
                        // Execution history'de yoksa, assignment'tan kontrol et
                        canStart = currentAssignment.Status == TaskItemStatus.Pending || 
                                  currentAssignment.Status == TaskItemStatus.Ready || 
                                  currentAssignment.Status == TaskItemStatus.WaitingRetry;
                    }
                    else if (taskStatusForStart == TaskItemStatus.Completed)
                    {
                        // Execution history'de Completed ise, bu task daha önce çalışmış
                        // Ama önşartlar tamamlandığı için, bu task'ı tekrar başlatmak isteyebiliriz
                        // Bu durumda, assignment durumunu kontrol et
                        canStart = currentAssignment.Status == TaskItemStatus.Pending || 
                                  currentAssignment.Status == TaskItemStatus.Ready || 
                                  currentAssignment.Status == TaskItemStatus.WaitingRetry;
                    }
                    else
                    {
                        // Execution history'de varsa ve Completed değilse, statüyü oradan kontrol et
                        canStart = taskStatusForStart == TaskItemStatus.Pending || 
                                  taskStatusForStart == TaskItemStatus.Ready || 
                                  taskStatusForStart == TaskItemStatus.WaitingRetry;
                    }
                    
                    if (canStart)
                    {
                        // skipCanStartCheck = true: Önşart kontrolünü zaten yaptık, bu yüzden CanStartTaskItemAsync kontrolünü atla
                        // Çünkü önşartlar tamamlandı ve task başlatılabilir durumda
                        // triggeredBy null geçiliyor, böylece StartTaskItemAsync içinde group execution'dan TriggeredBy alınır
                        await StartTaskItemAsync(assignment.TaskItemId, assignment.GroupId, skipCanStartCheck: true, triggeredBy: null);
                    }
                }
            }
        }
    }

    public async Task<List<TaskItem>> GetReadyTaskItemsAsync()
    {
        var data = await _dataService.GetDataAsync();
        var readyTaskItems = new List<TaskItem>();

        // GroupTaskAssignment durumlarını kontrol et (grup bazlı durum)
        foreach (var assignment in data.GroupTaskAssignments)
        {
            var taskItem = data.TaskItems.FirstOrDefault(t => t.Id == assignment.TaskItemId);
            if (taskItem == null) continue;
            
            if (await CanStartTaskItemAsync(taskItem.Id, assignment.GroupId))
            {
                if (assignment.Status == TaskItemStatus.Pending || assignment.Status == TaskItemStatus.WaitingRetry)
                {
                    assignment.Status = TaskItemStatus.Ready;
                    assignment.UpdatedAt = DateTime.Now;
                    await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
                    
                    // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir
                }
                
                // Ready task'ları ekle (her grup için ayrı)
                if (!readyTaskItems.Any(t => t.Id == taskItem.Id))
                {
                    readyTaskItems.Add(taskItem);
                }
            }
        }

        return readyTaskItems;
    }

    public async Task<bool> StartGroupAsync(string groupId, string triggeredBy = "Manual", string? flowItemId = null, string? flowItemExecutionId = null)
    {
        var group = await _dataService.GetGroupAsync(groupId);
        if (group == null)
        {
            return false;
        }

        // Grubun tüm task assignment'larını al (sıraya göre)
        var assignments = await _dataService.GetGroupTaskAssignmentsAsync(groupId);
        if (assignments.Count == 0)
        {
            return false;
        }

        // ÖNEMLİ: Aynı flowExecutionId ile aktif bir execution varsa tekrar başlatma (duplicate önleme)
        if (!string.IsNullOrEmpty(flowItemExecutionId))
        {
            var existingExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId, flowItemExecutionId);
            var activeExecution = existingExecutions.FirstOrDefault(e => e.EndTime == null);
            if (activeExecution != null)
            {
                Console.WriteLine($"[StartGroupAsync] Group '{groupId}' already has an active execution ({activeExecution.Id}) in flow execution '{flowItemExecutionId}'. Skipping duplicate start.");
                return false;
            }
        }
        
        // Group execution history başlat
        var groupExecution = await _executionHistoryService.StartGroupExecutionAsync(groupId, triggeredBy, flowItemId, flowItemExecutionId);
        
        var groupName = group?.Name ?? groupId;
        Console.WriteLine($"[STATUS] Group '{groupName}' -> Started");
        
        var data = await _dataService.GetDataAsync();
        var allTaskItems = data.TaskItems.ToDictionary(t => t.Id);

        // 1. ADIM: Tüm task'ları sıfırla ve Pending durumuna getir (sadece GroupTaskAssignment)
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir ve 
        // farklı gruplardaki aynı task'ın durumlarını birbirinden bağımsız tutmak için
        // sadece GroupTaskAssignment durumunu kullanıyoruz
        foreach (var assignment in assignments)
        {
            // GroupTaskAssignment durumunu güncelle (grup bazlı durum)
            assignment.Status = TaskItemStatus.Pending;
            assignment.Progress = 0;
            assignment.StartTime = null;
            assignment.EndTime = null;
            assignment.ErrorMessage = null;
            assignment.LastErrorTime = null;
            assignment.UpdatedAt = DateTime.UtcNow;
            await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
        }

        // 2. ADIM: Önşartı olmayan task'ları başlat (Running)
        // NOT: DbContext thread-safe olmadığı için paralel başlatma yerine sırayla başlatıyoruz
        foreach (var assignment in assignments)
        {
            // Önşart kontrolü: Bu task'ın önşartı var mı? (aynı grup içinde)
            bool hasPrerequisites = assignment.PrerequisiteTaskItemIds != null && 
                                   assignment.PrerequisiteTaskItemIds.Count > 0 &&
                                   assignment.PrerequisiteTaskItemIds.Any(prereqId => 
                                       assignments.Any(a => a.TaskItemId == prereqId && a.GroupId == groupId));

            if (!hasPrerequisites)
            {
                // Önşartı yok, başlat
                var taskItem = await _dataService.GetTaskItemAsync(assignment.TaskItemId);
                if (taskItem != null)
                {
                    await StartTaskItemAsync(taskItem.Id, groupId, triggeredBy: triggeredBy, flowItemId: flowItemId, flowItemExecutionId: flowItemExecutionId);
                }
            }
        }

        return true;
    }

    /// <summary>
    /// Bir task'ın önşart olduğu tüm alt task'ları recursive olarak bulur (tek yönlü - ileriye doğru)
    /// </summary>
    private HashSet<string> FindAllDependentTasks(string taskItemId, List<GroupTaskAssignment> assignments)
    {
        var dependentTaskIds = new HashSet<string>();
        var queue = new Queue<string>();
        queue.Enqueue(taskItemId);
        dependentTaskIds.Add(taskItemId);

        while (queue.Count > 0)
        {
            var currentTaskId = queue.Dequeue();

            // Bu task'ın önşart olduğu tüm task'ları bul
            foreach (var assignment in assignments)
            {
                if (assignment.PrerequisiteTaskItemIds != null && 
                    assignment.PrerequisiteTaskItemIds.Contains(currentTaskId))
                {
                    // Bu task henüz eklenmemişse ekle
                    if (!dependentTaskIds.Contains(assignment.TaskItemId))
                    {
                        dependentTaskIds.Add(assignment.TaskItemId);
                        queue.Enqueue(assignment.TaskItemId);
                    }
                }
            }
        }

        return dependentTaskIds;
    }

    public async Task<bool> StartGroupFromTaskAsync(string groupId, string fromTaskItemId, string triggeredBy = "Manual", string? flowItemId = null, string? flowItemExecutionId = null)
    {
        // 1. ADIM: Grup varlığını kontrol et
        var group = await _dataService.GetGroupAsync(groupId);
        if (group == null)
        {
            return false;
        }

        // 2. ADIM: Grubun task assignment'larını al
        var assignments = await _dataService.GetGroupTaskAssignmentsAsync(groupId);
        if (assignments.Count == 0)
        {
            return false;
        }

        // 3. ADIM: Seçilen task'ın assignment'ını bul
        var fromAssignment = assignments.FirstOrDefault(a => a.TaskItemId == fromTaskItemId);
        if (fromAssignment == null)
        {
            return false;
        }

        // 4. ADIM: İlgili grubun son önceki execution'ı bul
        var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId: groupId);
        var previousGroupExecution = groupExecutions.OrderByDescending(e => e.StartTime).FirstOrDefault();

        // 5. ADIM: İlgili task ve bu task'ın sonrasında önşart olduğu tüm alt task'ları bul
        // (Recursive - ağaç yapısı, tek yönlü - ileriye doğru)
        var tasksToExcludeFromHistory = FindAllDependentTasks(fromTaskItemId, assignments);

        // 6. ADIM: Yeni grup execution başlat
        var newGroupExecution = await _executionHistoryService.StartGroupExecutionAsync(groupId, triggeredBy, flowItemId, flowItemExecutionId);

        // 7. ADIM: 5. adımda bulunan task'lar harici tüm task statülerini yeni execution'a kopyala
        if (previousGroupExecution != null)
        {
            var historyService = _executionHistoryService as ExecutionHistoryService;
            if (historyService != null)
            {
                var dbContext = historyService.GetDbContextPublic();
                if (dbContext != null)
                {
                    // Önceki execution'daki tüm task execution history'lerini al
                    var previousTaskExecutions = await dbContext.TaskExecutionHistories
                        .Where(e => e.GroupExecutionId == previousGroupExecution.Id)
                        .ToListAsync();

                    // 5. adımda bulunan task'lar harici tüm task'ların history'lerini kopyala
                    var copiedTaskIds = new List<string>();
                    var now = DateTime.Now;
                    foreach (var previousExecution in previousTaskExecutions)
                    {
                        // Eğer bu task, çalıştırılacak task'lar arasında değilse, history'sini kopyala
                        if (!tasksToExcludeFromHistory.Contains(previousExecution.TaskItemId))
                        {
                            // Yeni execution için task execution history kopyala
                            // ÖNEMLİ: StartTime'ı bugünün tarihine güncelle ki UI bugünün execution'larını görebilsin
                            // EndTime'ı da bugünün tarihine güncelle (task zaten tamamlanmış)
                            var newTaskExecution = new TaskExecutionHistory
                            {
                                Id = Guid.NewGuid().ToString(),
                                TaskItemId = previousExecution.TaskItemId,
                                GroupId = previousExecution.GroupId,
                                GroupExecutionId = newGroupExecution.Id,
                                StartTime = now, // Bugünün tarihine güncelle - UI bugünün execution'larını arıyor
                                EndTime = now, // Bugünün tarihine güncelle - task zaten tamamlanmış
                                FinalStatus = previousExecution.FinalStatus,
                                Progress = previousExecution.Progress,
                                ErrorMessage = previousExecution.ErrorMessage,
                                ErrorCount = previousExecution.ErrorCount,
                                RetryStartTime = previousExecution.RetryStartTime,
                                FlowItemId = previousExecution.FlowItemId,
                                FlowItemExecutionId = previousExecution.FlowItemExecutionId,
                                TaskParameterValues = previousExecution.TaskParameterValues ?? new Dictionary<string, string?>()
                            };

                            dbContext.TaskExecutionHistories.Add(newTaskExecution);
                            copiedTaskIds.Add(previousExecution.TaskItemId);
                        }
                    }

                    await dbContext.SaveChangesAsync();

                    // Çalıştırılacak task'lar (seçilen task ve bağımlıları) için Pending kayıtları oluştur
                    // Bu sayede tüm task'ların execution history'leri baştan görünecek
                    var dataForPending = await _dataService.GetDataAsync();
                    var nowForPending = DateTime.Now;
                    foreach (var taskId in tasksToExcludeFromHistory)
                    {
                        var assignmentForPending = assignments.FirstOrDefault(a => a.TaskItemId == taskId);
                        if (assignmentForPending != null)
                        {
                            // Bu task için zaten bir kayıt var mı kontrol et
                            var existingExecution = await dbContext.TaskExecutionHistories
                                .Where(e => e.TaskItemId == taskId && 
                                           e.GroupId == groupId &&
                                           e.GroupExecutionId == newGroupExecution.Id)
                                .FirstOrDefaultAsync();

                            // Eğer kayıt yoksa, Pending kaydı oluştur
                            if (existingExecution == null)
                            {
                                var pendingExecution = new TaskExecutionHistory
                                {
                                    Id = Guid.NewGuid().ToString(),
                                    TaskItemId = taskId,
                                    GroupId = groupId,
                                    GroupExecutionId = newGroupExecution.Id,
                                    StartTime = nowForPending,
                                    EndTime = null,
                                    FinalStatus = TaskItemStatus.Pending,
                                    Progress = 0,
                                    ErrorMessage = null,
                                    ErrorCount = 0,
                                    RetryStartTime = null,
                                    FlowItemId = flowItemId,
                                    FlowItemExecutionId = flowItemExecutionId,
                                    TaskParameterValues = assignmentForPending.TaskParameterValues ?? new Dictionary<string, string?>()
                                };

                                dbContext.TaskExecutionHistories.Add(pendingExecution);
                            }
                        }
                    }

                    await dbContext.SaveChangesAsync();
                }
            }
        }

        // 7. ADIM (Devam): Yeni execution'a bağlı tüm task execution history'lerini bul ve statülerini yansıt
        var historyServiceForStatus = _executionHistoryService as ExecutionHistoryService;
        if (historyServiceForStatus != null)
        {
            var dbContextForStatus = historyServiceForStatus.GetDbContextPublic();
            if (dbContextForStatus != null)
            {
                // Yeni execution'a bağlı tüm task execution history'lerini al
                var newTaskExecutions = await dbContextForStatus.TaskExecutionHistories
                    .Where(e => e.GroupExecutionId == newGroupExecution.Id)
                    .ToListAsync();

                // Bu task'ların statülerini GroupTaskAssignment'lara yansıt
                var data = await _dataService.GetDataAsync();
                var now = DateTime.UtcNow;
                foreach (var taskExecution in newTaskExecutions)
                {
                    var assignment = data.GroupTaskAssignments
                        .FirstOrDefault(a => a.TaskItemId == taskExecution.TaskItemId && a.GroupId == groupId);
                    
                    if (assignment != null)
                    {
                        // Yeni execution'daki task execution history'ye göre GroupTaskAssignment durumunu güncelle
                        assignment.Status = taskExecution.FinalStatus;
                        assignment.Progress = taskExecution.Progress;
                        // StartTime ve EndTime'ı bugünün tarihine güncelle (UI bugünün execution'larını arıyor)
                        assignment.StartTime = taskExecution.StartTime;
                        assignment.EndTime = taskExecution.EndTime;
                        assignment.ErrorMessage = taskExecution.ErrorMessage;
                        
                        if (taskExecution.FinalStatus == TaskItemStatus.Failed && 
                            taskExecution.ErrorMessage != null)
                        {
                            assignment.LastErrorTime = taskExecution.EndTime;
                        }
                        
                        assignment.UpdatedAt = DateTime.Now;
                        await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
                    }
                }
            }
        }

        // 8. ADIM: Sonrasında çalıştırmak istediğimiz ilk işi başlat ve ardından bağımlı task'ları tetikle
        var fromTaskItem = await _dataService.GetTaskItemAsync(fromTaskItemId);
        if (fromTaskItem != null)
        {
            // skipCanStartCheck = true: Ortadan başlatma yaparken CanStartTaskItemAsync kontrolünü atla
            // çünkü manuel olarak başlatıyoruz ve önşartlar zaten history'den kopyalandı
            await StartTaskItemAsync(fromTaskItem.Id, groupId, skipCanStartCheck: true, triggeredBy: triggeredBy, flowItemId: flowItemId, flowItemExecutionId: flowItemExecutionId);
        }

        return true;
    }

    public async Task<bool> StartFlowAsync(string flowItemId, string triggeredBy = "Manual")
    {
        Console.WriteLine($"[StartFlowAsync] Attempting to start Flow: {flowItemId} triggered by {triggeredBy}");
        
        // 1. Akışı kontrol et
        var flowItem = await _dataService.GetFlowItemAsync(flowItemId);
        if (flowItem == null) 
        {
            Console.WriteLine($"[StartFlowAsync] ERROR: FlowItem {flowItemId} not found.");
            // Diagnostik için mevcut tüm flow item'ları bas
            var allFlows = await _dataService.GetDataAsync();
            Console.WriteLine($"[StartFlowAsync] Available FlowItems Count: {allFlows.FlowItems.Count}");
            foreach (var f in allFlows.FlowItems)
            {
                Console.WriteLine($"[StartFlowAsync] Available Flow: Id={f.Id}, Name={f.Name}");
            }
            return false;
        }

        // 2. Akışa ait grupları al
        var flowAssignments = await _dataService.GetFlowGroupAssignmentsAsync(flowItemId);
        if (flowAssignments.Count == 0) 
        {
            Console.WriteLine($"[StartFlowAsync] ERROR: No group assignments found for Flow {flowItemId}.");
            return false;
        }

        // 2.5 Eski aktif çalışmaları sonlandır (Restart durumu)
        await _executionHistoryService.TerminateActiveExecutionsAsync(flowItemId, "New manual start triggered");

        // 3. Flow Execution History başlat
        var flowExecution = await _executionHistoryService.StartFlowExecutionAsync(flowItemId, triggeredBy);
        Console.WriteLine($"[STATUS] Flow '{flowItem.Name}' -> Started (ID: {flowExecution.Id})");

        // 4. Tüm grupların FlowGroupAssignment statülerini sıfırla (Pending)
        foreach (var assignment in flowAssignments)
        {
            assignment.Status = TaskItemStatus.Pending;
            assignment.Progress = 0;
            assignment.StartTime = null;
            assignment.EndTime = null;
            assignment.ErrorMessage = null;
            assignment.LastErrorTime = null;
            assignment.UpdatedAt = DateTime.UtcNow;
            await _dataService.UpdateFlowGroupAssignmentAsync(assignment);
        }

        // 5. Başlangıç gruplarını bul (Önşartı olmayan gruplar)
        // flowAssignments içindeki PrerequisiteGroupIds listesini kontrol et
        // PrerequisiteGroupIds boş olan veya akış içinde olmayan gruplar başlangıç grubudur.
        
        foreach (var assignment in flowAssignments)
        {
            bool hasPrerequisites = assignment.PrerequisiteGroupIds != null && 
                                   assignment.PrerequisiteGroupIds.Count > 0 &&
                                   assignment.PrerequisiteGroupIds.Any(pId => flowAssignments.Any(fa => fa.GroupId == pId));

            if (!hasPrerequisites)
            {
                // Başlat
                Console.WriteLine($"[FLOW] Starting initial group: {assignment.GroupId}");
                await StartGroupAsync(assignment.GroupId, triggeredBy, flowItemId, flowExecution.Id);
                
                // FlowGroupAssignment durumunu Running yap
                assignment.Status = TaskItemStatus.Running;
                assignment.StartTime = DateTime.Now;
                await _dataService.UpdateFlowGroupAssignmentAsync(assignment);
            }
        }

        return true;
    }

    /// <summary>
    /// Tamamlanan bir grubu önşart olarak kullanan bağımlı grupları kontrol edip başlatır
    /// </summary>
    private async Task StartDependentGroupsAsync(string completedGroupId, string flowExecutionId)
    {
        // Flow execution history'den flowId'yi bul
        var flowExecution = await _executionHistoryService.GetFlowExecutionHistoryAsync(flowExecutionId);
        if (flowExecution == null) return;

        var flowId = flowExecution.FlowItemId;
        var assignments = await _dataService.GetFlowGroupAssignmentsAsync(flowId);
        
        foreach (var assignment in assignments)
        {
            // Bu grup, tamamlanan grubu önşart olarak kullanıyor mu?
            if (assignment.PrerequisiteGroupIds != null && assignment.PrerequisiteGroupIds.Contains(completedGroupId))
            {
                // Grubun tüm önşartları tamamlandı mı?
                bool allPrerequisitesCompleted = true;
                foreach (var prereqId in assignment.PrerequisiteGroupIds)
                {
                    // Bu akış içindeki önşart grubunun durumunu kontrol et
                    var prereqAssignment = assignments.FirstOrDefault(a => a.GroupId == prereqId);
                    if (prereqAssignment == null || (prereqAssignment.Status != TaskItemStatus.Completed && prereqAssignment.Status != TaskItemStatus.MarkedAsSuccess))
                    {
                        // assignment.Status güncel olmayabilir, DB geçmişinden kontrol et
                        var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId: prereqId);
                        var completedPrereq = groupExecutions.Any(e => 
                            e.FlowItemExecutionId == flowExecutionId && 
                            e.EndTime != null && 
                            (e.Status == TaskItemStatus.Completed || e.Status == TaskItemStatus.MarkedAsSuccess));
                        
                        if (!completedPrereq)
                        {
                            allPrerequisitesCompleted = false;
                            break;
                        }
                    }
                }

                if (allPrerequisitesCompleted)
                {
                    // Grubu başlat
                    await StartGroupAsync(assignment.GroupId, "Flow", flowId, flowExecutionId);
                    
                    // FlowGroupAssignment durumunu Running yap
                    assignment.Status = TaskItemStatus.Running;
                    assignment.StartTime = DateTime.Now;
                    await _dataService.UpdateFlowGroupAssignmentAsync(assignment);
                }
            }
        }
    }

    public async Task<bool> MarkGroupAsSuccessAsync(string groupId, string flowItemExecutionId)
    {
        try
        {
            // 1. Group execution history'yi bul ve güncelle
            var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId: groupId);
            var latestExec = groupExecutions
                .Where(e => e.FlowItemExecutionId == flowItemExecutionId)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefault();

            if (latestExec != null)
            {
                latestExec.EndTime ??= DateTime.Now;
                latestExec.FailedTasks = 0; // Bağımlı grupların başlayabilmesi için FailedTasks 0 olmalı
                
                await _executionHistoryService.CompleteGroupExecutionAsync(
                    latestExec.Id, 
                    latestExec.TotalTasks, 
                    latestExec.TotalTasks, // Tümünü tamamlanmış say
                    0, 
                    0,
                    latestExec.TotalTasks, // markedAsSuccessTasks
                    TaskItemStatus.MarkedAsSuccess
                );
            }

            // 3. Bağımlı grupları tetikle
            await StartDependentGroupsAsync(groupId, flowItemExecutionId);
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MarkGroupAsSuccessAsync] Error: {ex.Message}");
            return false;
        }
    }

    public async Task<bool> StopGroupAsync(string groupId, string flowItemExecutionId)
    {
        try
        {
            // Gruptaki tüm aktif taskları durdur
            var activeTasks = await _executionHistoryService.GetTaskExecutionHistoriesAsync(groupId: groupId);
            
            // Mevcut group execution id'yi bul
            var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId: groupId);
            var latestExec = groupExecutions
                .Where(e => e.FlowItemExecutionId == flowItemExecutionId && e.EndTime == null)
                .FirstOrDefault();

            if (latestExec != null)
            {
                var tasksToStop = activeTasks.Where(t => t.GroupExecutionId == latestExec.Id && t.EndTime == null);
                foreach (var task in tasksToStop)
                {
                    await StopTaskItemAsync(task.TaskItemId, groupId);
                }

                // GroupExecutionHistory'yi sonlandır
                var historyService = _executionHistoryService as ExecutionHistoryService;
                if (historyService != null)
                {
                    var dbContext = historyService.GetDbContextPublic();
                    if (dbContext != null)
                    {
                        var executionToUpdate = await dbContext.GroupExecutionHistories.FirstOrDefaultAsync(e => e.Id == latestExec.Id);
                        if (executionToUpdate != null)
                        {
                            executionToUpdate.EndTime = DateTime.Now;
                            executionToUpdate.Status = TaskItemStatus.Failed;
                            // Durdurulan bir grup olduğu için Failed olarak işaretlemek mantıklı olabilir
                            // Ancak UI logic failedTasks > 0 ise Failed gösteriyor
                            // Şimdilik sadece EndTime set ediyoruz
                            await dbContext.SaveChangesAsync();
                        }
                    }
                    else
                    {
                        // JSON Modu
                        latestExec.EndTime = DateTime.Now;
                        latestExec.Status = TaskItemStatus.Failed;
                    }
                }
            }

            // FlowGroupAssignment durumunu güncelle
            var flowExecution = await _executionHistoryService.GetFlowExecutionHistoryAsync(flowItemExecutionId);
            if (flowExecution != null)
            {
                var assignments = await _dataService.GetFlowGroupAssignmentsAsync(flowExecution.FlowItemId);
                var assignment = assignments.FirstOrDefault(a => a.GroupId == groupId);
                if (assignment != null)
                {
                    assignment.Status = TaskItemStatus.Failed;
                    assignment.EndTime = DateTime.Now;
                    await _dataService.UpdateFlowGroupAssignmentAsync(assignment);
                }
            }

            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[StopGroupAsync] Error: {ex.Message}");
            return false;
        }
    }

    public async Task<bool> PauseGroupAsync(string groupId, string flowItemExecutionId)
    {
        try
        {
            var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId: groupId);
            var latestExec = groupExecutions
                .Where(e => e.FlowItemExecutionId == flowItemExecutionId && e.EndTime == null)
                .FirstOrDefault();

            if (latestExec != null)
            {
                var activeTasks = await _executionHistoryService.GetTaskExecutionHistoriesAsync(groupId: groupId);
                var tasksToPause = activeTasks.Where(t => t.GroupExecutionId == latestExec.Id && t.EndTime == null && t.FinalStatus == TaskItemStatus.Running);
                foreach (var task in tasksToPause)
                {
                    await PauseTaskItemAsync(task.TaskItemId, groupId);
                }
            }
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PauseGroupAsync] Error: {ex.Message}");
            return false;
        }
    }

    public async Task<bool> ResumeGroupAsync(string groupId, string flowItemExecutionId)
    {
        try
        {
            var groupExecutions = await _executionHistoryService.GetGroupExecutionHistoriesAsync(groupId: groupId);
            var latestExec = groupExecutions
                .Where(e => e.FlowItemExecutionId == flowItemExecutionId && e.EndTime == null)
                .FirstOrDefault();

            if (latestExec != null)
            {
                var activeTasks = await _executionHistoryService.GetTaskExecutionHistoriesAsync(groupId: groupId);
                var tasksToResume = activeTasks.Where(t => t.GroupExecutionId == latestExec.Id && t.FinalStatus == TaskItemStatus.Paused);
                foreach (var task in tasksToResume)
                {
                    await ResumeTaskItemAsync(task.TaskItemId, groupId);
                }
            }
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ResumeGroupAsync] Error: {ex.Message}");
            return false;
        }
    }

    public async Task<bool> RestartGroupInFlowAsync(string groupId, string flowItemId, string flowItemExecutionId)
    {
        try
        {
            // 1. Önce mevcut çalışmayı durdur (varsa)
            await StopGroupAsync(groupId, flowItemExecutionId);

            // 2. Grubu flow context'i ile tekrar başlat
            return await StartGroupAsync(groupId, "Manual-Restart", flowItemId, flowItemExecutionId);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[RestartGroupInFlowAsync] Error: {ex.Message}");
            return false;
        }
    }

    public async Task<bool> RestartTaskItemAsync(string taskItemId, string? groupId = null, string? triggeredBy = null)
    {
        var taskItem = await _dataService.GetTaskItemAsync(taskItemId);
        if (taskItem == null)
        {
            return false;
        }

        // GroupId belirtilmemişse, execution history'den bul
        groupId = await ResolveGroupIdAsync(taskItemId, groupId);
        
        // GroupId hala null ise, assignment'tan bul
        if (string.IsNullOrEmpty(groupId))
        {
            var data = await _dataService.GetDataAsync();
            var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId);
            if (assignment != null)
            {
                groupId = assignment.GroupId;
            }
        }

        TaskItemStatus? currentStatus = null;

        // GroupTaskAssignment durumunu kontrol et (grup bazlı durum)
        if (!string.IsNullOrEmpty(groupId))
        {
            var data = await _dataService.GetDataAsync();
            var assignment = data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItemId && a.GroupId == groupId);
            if (assignment != null)
            {
                currentStatus = assignment.Status;
            }
        }
        
        // Eğer assignment'tan statü alınamadıysa, TaskExecutionHistory'den bugünün statüsünü al
        if (!currentStatus.HasValue)
        {
            var historyServiceForStatus = _executionHistoryService as ExecutionHistoryService;
            if (historyServiceForStatus != null)
            {
                var dbContext = historyServiceForStatus.GetDbContextPublic();
                if (dbContext != null)
                {
                    var today = DateTime.Now.Date;
                    var todayExecution = await dbContext.TaskExecutionHistories
                        .Where(e => e.TaskItemId == taskItemId && 
                                   (string.IsNullOrEmpty(groupId) || e.GroupId == groupId) &&
                                   e.StartTime.Date == today)
                        .OrderByDescending(e => e.StartTime)
                        .FirstOrDefaultAsync();
                    
                    if (todayExecution != null)
                    {
                        currentStatus = todayExecution.FinalStatus;
                    }
                }
            }
        }
        
        // Eğer hala statü yoksa, Pending olarak kabul et
        if (!currentStatus.HasValue)
        {
            currentStatus = TaskItemStatus.Pending;
        }

        // Running durumundaki task'lar restart edilemez, önce durdurulmalı
        if (currentStatus.Value == TaskItemStatus.Running)
            {
                return false;
        }

        // Paused durumundaki task'lar için önce resume edilmeli, restart yerine
        // Ancak kullanıcı restart istiyorsa, durumu sıfırlayıp baştan başlatabiliriz
        // Completed, Failed, Paused, WaitingRetry, Pending durumlarındaki task'lar restart edilebilir

        // Execution history'deki bugünün kaydını kontrol et ve güncelle
        // Bu, CanStartTaskItemAsync'ın doğru çalışması için gerekli
        var historyService = _executionHistoryService as ExecutionHistoryService;
        if (historyService != null)
        {
            var dbContext = historyService.GetDbContextPublic();
            if (dbContext != null)
            {
                // Veritabanı modunda
                // GroupId null olsa bile bugün için execution history kaydını kontrol et
                var today = DateTime.Now.Date;
                
                // Bugün için bu task'ın execution history kaydını bul
                var query = dbContext.TaskExecutionHistories
                    .Where(e => e.TaskItemId == taskItemId && e.StartTime.Date == today);
                
                if (!string.IsNullOrEmpty(groupId))
                {
                    query = query.Where(e => e.GroupId == groupId);
                }
                
                var todayExecution = await query
                    .OrderByDescending(e => e.StartTime)
                    .FirstOrDefaultAsync();
                
                if (todayExecution != null)
                {
                    // Eski execution history kaydını kapat (restart için)
                    // Yeni bir execution StartTaskItemAsync tarafından başlatılacak
                    if (todayExecution.EndTime == null)
                    {
                        // Aktif execution varsa kapat
                        todayExecution.EndTime = DateTime.Now;
                        todayExecution.FinalStatus = TaskItemStatus.Pending; // Restart için Pending olarak işaretle
                        todayExecution.Progress = 0;
                        todayExecution.ErrorMessage = null;
                        await dbContext.SaveChangesAsync();
                    }
                    else
                    {
                        // Zaten kapatılmış execution varsa, statüsünü Pending yap
                        // Bu, CanStartTaskItemAsync'ın doğru çalışması için gerekli
                        // NOT: GetTodayTaskStatusesByGroupAsync group execution'a göre çalıştığı için
                        // bu execution'ın statüsünü güncellemek yeterli olmayabilir
                        // Bu yüzden tüm bugünün execution'larını Pending yapıyoruz
                        todayExecution.FinalStatus = TaskItemStatus.Pending;
                        todayExecution.Progress = 0;
                        todayExecution.ErrorMessage = null;
                        await dbContext.SaveChangesAsync();
                    }
                }
                
                // Ayrıca, bugün için bu task'ın tüm execution'larını kontrol et
                // GetTodayTaskStatusesByGroupAsync en son execution'ı alıyor, bu yüzden
                // tüm execution'ları Pending yapmak yerine sadece en son olanı güncellemek yeterli
                // Ama eğer group execution yoksa, direkt task execution'ları kontrol edilmeli
            }
            else
            {
                // JSON modunda - memory'deki aktif execution'ı güncelle
                var activeExecution = await historyService.GetActiveTaskExecutionAsync(taskItemId);
                if (activeExecution != null)
                {
                    activeExecution.FinalStatus = TaskItemStatus.Pending;
                    activeExecution.EndTime = null;
                    activeExecution.Progress = 0;
                    activeExecution.ErrorMessage = null;
                }
            }
        }

        // GroupTaskAssignment durumunu güncelle
        // NOT: TaskItem durumunu güncellemiyoruz çünkü TaskItem global bir entity'dir ve 
        // farklı gruplardaki aynı task'ın durumlarını birbirinden bağımsız tutmak için
        // sadece GroupTaskAssignment durumunu kullanıyoruz
        if (!string.IsNullOrEmpty(groupId))
        {
        await UpdateTaskStatusInAssignmentAsync(taskItemId, groupId, assignment =>
        {
            assignment.Status = TaskItemStatus.Pending;
            assignment.Progress = 0;
            assignment.StartTime = null;
            assignment.EndTime = null;
            assignment.ErrorMessage = null;
            assignment.LastErrorTime = null;
        });
        }
        else
        {
            // GroupId yoksa, TaskItem durumunu güncelle (geriye uyumluluk)
            // TaskItem'dan Status kaldırıldı, TaskExecutionHistory kullanılıyor
            taskItem.Progress = 0;
            taskItem.StartTime = null;
            taskItem.EndTime = null;
            taskItem.ErrorMessage = null;
            taskItem.LastErrorTime = null;
            taskItem.UpdatedAt = DateTime.Now;
            await _dataService.UpdateTaskItemAsync(taskItem);
        }

        // Şimdi task'ı başlat
        // Restart işlemi için CanStartTaskItemAsync kontrolünü bypass et
        // Çünkü execution history'yi zaten güncelledik ve assignment'ı Pending yaptık
        return await StartTaskItemAsync(taskItemId, groupId, skipCanStartCheck: true, triggeredBy: triggeredBy);
    }

    public async Task CheckAndTriggerScheduledGroupsAsync()
    {
        var activeSchedules = await _dataService.GetActiveGroupSchedulesAsync();
        var now = DateTime.UtcNow;
        var nowLocal = DateTime.Now; // Yerel saat için

        if (activeSchedules.Count == 0)
        {
            return;
        }

        
        // Tüm grupları listele (debug için)
        var allGroups = (await _dataService.GetDataAsync()).Groups;
        foreach (var group in allGroups)
        {
            var hasSchedule = activeSchedules.Any(s => s.GroupId == group.Id);
        }

        foreach (var schedule in activeSchedules)
        {
            bool shouldRun = false;
            var startTimeToday = nowLocal.Date.Add(schedule.StartTime);
            
            
            // Bugün için execution history var mı ve tamamlanmış mı kontrol et
            var historyService = _executionHistoryService as ExecutionHistoryService;
            bool hasExecutionToday = false;
            bool isExecutionCompleted = false;
            if (historyService != null)
            {
                var latestGroupExecution = await historyService.GetLatestGroupExecutionTodayAsync(schedule.GroupId);
                if (latestGroupExecution != null)
                {
                    // Grubun task assignment'larını al
                    var assignments = await _dataService.GetGroupTaskAssignmentsAsync(schedule.GroupId);
                    int totalTasks = assignments.Count;
                    int completedTasks = 0;
                    int failedTasks = 0;
                    
                    // Gerçek task execution'larını kontrol et
                    var dbContext = historyService.GetDbContextPublic();
                    bool hasAnyTaskExecution = false;
                    
                    if (dbContext != null && totalTasks > 0)
                {
                    var today = DateTime.Now.Date;
                    
                    // Bu grubun bugünkü tüm task execution history'lerini tek seferde al (N+1 engelleme)
                    var groupTaskExecutions = await dbContext.TaskExecutionHistories
                        .Where(e => e.GroupId == schedule.GroupId && 
                                   e.GroupExecutionId == latestGroupExecution.Id && 
                                   e.StartTime.Date == today)
                        .ToListAsync();
                    
                    hasAnyTaskExecution = groupTaskExecutions.Any();
                    
                    // Her task'ın durumunu bellekten kontrol et
                    foreach (var assignment in assignments)
                    {
                        var todayExecution = groupTaskExecutions
                            .Where(e => e.TaskItemId == assignment.TaskItemId)
                            .OrderByDescending(e => e.StartTime)
                            .FirstOrDefault();
                        
                        if (todayExecution != null)
                        {
                            // EndTime set edilmişse ve Completed veya Failed ise tamamlanmış sayılır
                            if (todayExecution.EndTime.HasValue)
                            {
                                if (todayExecution.FinalStatus == TaskItemStatus.Completed || todayExecution.FinalStatus == TaskItemStatus.MarkedAsSuccess)
                                {
                                    completedTasks++;
                                }
                                else if (todayExecution.FinalStatus == TaskItemStatus.Failed)
                                {
                                    failedTasks++;
                                }
                            }
                        }
                    }
                }
                    
                    
                    // Execution var mı kontrolü: 
                    // ÖNEMLİ: Sadece en az bir task tamamlanmışsa (Completed veya Failed) execution var sayılır
                    // Eğer hiçbiri tamamlanmamışsa (hepsi Running, Pending veya henüz başlamamış), 
                    // execution henüz başlamamış sayılır ve yeni execution başlatılabilir
                    if (totalTasks > 0)
                    {
                        // En az bir task tamamlanmışsa (Completed veya Failed) execution var demektir
                        // Eğer hiçbiri tamamlanmamışsa, yeni execution başlatılabilir
                        hasExecutionToday = (completedTasks + failedTasks) > 0;
                    }
                    else
                    {
                        // Task assignment'ı yok, sadece GroupExecutionHistory'ye bak
                        // En az bir task tamamlanmışsa execution var sayılır
                        hasExecutionToday = latestGroupExecution.TotalTasks > 0 && 
                                         (latestGroupExecution.CompletedTasks + latestGroupExecution.FailedTasks) > 0;
                    }
                    
                    // Execution tamamlanmış mı kontrolü:
                    // 1. EndTime set edilmişse VE
                    // 2. Tüm task'lar tamamlanmışsa (Completed + Failed == TotalTasks)
                    bool allTasksFinished = false;
                    if (totalTasks > 0)
                    {
                        // Gerçek task sayısına göre kontrol et
                        allTasksFinished = (completedTasks + failedTasks) == totalTasks && totalTasks > 0;
                    }
                    else if (latestGroupExecution.TotalTasks > 0)
                    {
                        // GroupExecutionHistory'deki sayılara göre kontrol et
                        allTasksFinished = (latestGroupExecution.CompletedTasks + latestGroupExecution.FailedTasks) == latestGroupExecution.TotalTasks;
                    }
                    
                    isExecutionCompleted = latestGroupExecution.EndTime.HasValue && allTasksFinished;
                    
                }
                else
                {
                }
            }
            
            // Başlangıç saati bugün geçtiyse kontrol et
            if (nowLocal >= startTimeToday)
            {
                if (schedule.LastRunTime == null)
                {
                    // İlk kez çalışacak - başlangıç saati geçtiyse çalıştır
                    shouldRun = true;
                }
                else
                {
                    var lastRunLocal = schedule.LastRunTime.Value.ToLocalTime();

                    switch (schedule.WorkPeriod)
                    {
                        case WorkPeriod.Daily:
                            // Günlük: Bir günde sadece bir kez çalışmalı
                            // 1. Bugün hiç execution yoksa → çalıştır
                            // 2. Bugün execution var ama tamamlanmamışsa → çalıştırma (devam ediyor)
                            // 3. Bugün execution var ve tamamlanmışsa → çalıştırma (zaten bugün çalıştı)
                            if (!hasExecutionToday)
                            {
                                // Bugün hiç execution yoksa çalıştır
                                shouldRun = true;
                            }
                            else if (isExecutionCompleted)
                            {
                                // Bugün execution var ve tamamlanmışsa, bir sonraki güne kadar beklemeli
                                shouldRun = false;
                            }
                            else if (lastRunLocal.Date < nowLocal.Date)
                            {
                                // Son çalıştırma dün veya daha önceyse bugün çalıştır
                                shouldRun = true;
                            }
                            else if (lastRunLocal.Date == nowLocal.Date && lastRunLocal < startTimeToday)
                            {
                                // Bugün başlangıç saatinden önce çalıştırıldıysa, başlangıç saatinden sonra tekrar çalıştır
                                shouldRun = true;
                            }
                            else
                            {
                                // Bugün başlangıç saatinden sonra çalıştırıldı ama henüz tamamlanmamış
                                shouldRun = false;
                            }
                            break;

                        case WorkPeriod.Weekly:
                            // Haftalık: Son çalıştırma bu hafta değilse
                            var startOfWeek = nowLocal.Date.AddDays(-(int)nowLocal.DayOfWeek);
                            var lastRunStartOfWeek = lastRunLocal.Date.AddDays(-(int)lastRunLocal.DayOfWeek);
                            
                            if (!hasExecutionToday)
                            {
                                // Bu hafta hiç çalışmamış
                                if (lastRunStartOfWeek < startOfWeek)
                                {
                                    shouldRun = true;
                                }
                            }
                            else if (isExecutionCompleted)
                            {
                                // Execution tamamlanmışsa, bu hafta içinde başka bir çalıştırma yapılabilir
                                if (lastRunStartOfWeek < startOfWeek)
                                {
                                    shouldRun = true;
                                }
                                else
                                {
                                }
                            }
                            else
                            {
                            }
                            break;

                        case WorkPeriod.Monthly:
                            // Aylık: Son çalıştırma bu ay değilse
                            if (!hasExecutionToday)
                            {
                                // Bu ay hiç çalışmamış
                                if (lastRunLocal.Year < nowLocal.Year || 
                                    (lastRunLocal.Year == nowLocal.Year && lastRunLocal.Month < nowLocal.Month))
                                {
                                    shouldRun = true;
                                }
                            }
                            else if (isExecutionCompleted)
                            {
                                // Execution tamamlanmışsa, bu ay içinde başka bir çalıştırma yapılabilir
                                if (lastRunLocal.Year < nowLocal.Year || 
                                    (lastRunLocal.Year == nowLocal.Year && lastRunLocal.Month < nowLocal.Month))
                                {
                                    shouldRun = true;
                                }
                                else
                                {
                                }
                            }
                            else
                            {
                            }
                            break;
                    }
                }
            }
            else
            {
            }

            if (shouldRun)
            {
                try
                {
                    var startResult = await StartGroupAsync(schedule.GroupId, "System");
                    
                    if (startResult)
                    {
                        // Son çalıştırma zamanını güncelle
                        schedule.LastRunTime = now;
                        await _dataService.CreateOrUpdateGroupScheduleAsync(schedule);
                    }
                    else
                    {
                    }
                }
                catch (Exception)
                {
                }
            }
        }
    }

    public async Task CheckAndTriggerScheduledFlowsAsync()
    {
        try 
        {
            var activeSchedules = await _dataService.GetActiveFlowSchedulesAsync();
            var now = DateTime.UtcNow;
            var nowLocal = DateTime.Now; // Yerel saat için

            Console.WriteLine($"[Flow Timer] Running at {nowLocal}, Active Schedules Count: {activeSchedules.Count}");

            if (activeSchedules.Count == 0)
            {
                return;
            }

            // OPTİMİZASYON: Tüm akış geçmişini tek seferde çek
            var today = nowLocal.Date;
            List<FlowExecutionHistory> allFlowHistories = new List<FlowExecutionHistory>();
            try 
            {
                allFlowHistories = await _executionHistoryService.GetFlowExecutionHistoriesAsync(startDate: today);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Flow Timer] Error fetching flow histories: {ex.Message}");
            }
            
            var flowHistoriesByFlowId = allFlowHistories.GroupBy(h => h.FlowItemId).ToDictionary(g => g.Key, g => g.ToList());

            foreach (var schedule in activeSchedules)
            {
                try 
                {
                    bool shouldRun = false;
                    var startTimeToday = nowLocal.Date.Add(schedule.StartTime);

                    Console.WriteLine($"[Flow Timer] Checking schedule for Flow: {schedule.FlowItemId}, StartTime: {schedule.StartTime}, LocalNow: {nowLocal.ToShortTimeString()}");

                    // Bugün için execution history var mı kontrol et
                    bool hasRunToday = false;
                    FlowExecutionHistory? latestRunToday = null;

                    if (flowHistoriesByFlowId.TryGetValue(schedule.FlowItemId, out var histories))
                    {
                        latestRunToday = histories.FirstOrDefault(h => h.StartTime.Date == today);
                        hasRunToday = latestRunToday != null;
                    }
                    
                    if (hasRunToday)
                    {
                        Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} already has a run today at {latestRunToday?.StartTime}");
                    }

                    // Başlangıç saati bugün geçtiyse kontrol et
                    if (nowLocal >= startTimeToday)
                    {
                        if (schedule.LastRunTime == null)
                        {
                            Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} has no LastRunTime, should run.");
                            shouldRun = true;
                        }
                        else
                        {
                            var lastRunLocal = schedule.LastRunTime.Value.ToLocalTime();
                            Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} LastRunLocal: {lastRunLocal}, HasRunToday: {hasRunToday}");

                            switch (schedule.WorkPeriod)
                            {
                                case WorkPeriod.Daily:
                                    if (!hasRunToday)
                                    {
                                        Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} has not run today, should run.");
                                        shouldRun = true;
                                    }
                                    else if (lastRunLocal.Date < nowLocal.Date)
                                    {
                                        Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} last run was before today, should run.");
                                        shouldRun = true;
                                    }
                                    else if (lastRunLocal.Date == nowLocal.Date && lastRunLocal < startTimeToday)
                                    {
                                        Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} last run today was before scheduled time, should run.");
                                        shouldRun = true;
                                    }
                                    break;

                                case WorkPeriod.Weekly:
                                    var startOfWeek = nowLocal.Date.AddDays(-(int)nowLocal.DayOfWeek);
                                    var lastRunStartOfWeek = lastRunLocal.Date.AddDays(-(int)lastRunLocal.DayOfWeek);
                                    if (lastRunStartOfWeek < startOfWeek) shouldRun = true;
                                    break;

                                case WorkPeriod.Monthly:
                                    if (lastRunLocal.Year < nowLocal.Year || (lastRunLocal.Year == nowLocal.Year && lastRunLocal.Month < nowLocal.Month)) shouldRun = true;
                                    break;
                            }
                        }
                    }
                    else
                    {
                        Console.WriteLine($"[Flow Timer] Flow {schedule.FlowItemId} scheduled time {startTimeToday.ToShortTimeString()} not reached yet.");
                    }

                    if (shouldRun)
                    {
                        Console.WriteLine($"[Flow Timer] Triggering Flow: {schedule.FlowItemId}");
                        try
                        {
                            var startResult = await StartFlowAsync(schedule.FlowItemId, "System");
                            Console.WriteLine($"[Flow Timer] StartFlowAsync result for {schedule.FlowItemId}: {startResult}");
                            
                            if (startResult)
                            {
                                schedule.LastRunTime = now;
                                await _dataService.UpdateFlowScheduleAsync(schedule);
                                Console.WriteLine($"[Flow Timer] Updated LastRunTime for {schedule.FlowItemId} via DataService.");
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[Flow Timer] CRITICAL ERROR triggering flow {schedule.FlowItemId}: {ex.Message}");
                            Console.WriteLine(ex.StackTrace);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Flow Timer] Error processing schedule for flow {schedule.FlowItemId}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
             Console.WriteLine($"[Flow Timer] Top level error in CheckAndTriggerScheduledFlowsAsync: {ex.Message}");
             Console.WriteLine(ex.StackTrace);
        }
    }

    /// <summary>
    /// Stored Procedure'ü çalıştırır
    /// </summary>
    private async Task ExecuteStoredProcedureAsync(TaskItem taskItem, string? groupId, ITaskDataService? dataService = null)
    {
        if (!taskItem.SourceType.HasValue || taskItem.SourceType.Value != TaskSourceType.StoredProcedure || 
            string.IsNullOrEmpty(taskItem.StoredProcedureName))
        {
            return;
        }

        // Parametreleri al - scoped dataService kullan veya fallback olarak _dataService
        var dataServiceToUse = dataService ?? _dataService;
        var data = await dataServiceToUse.GetDataAsync();
        var assignment = !string.IsNullOrEmpty(groupId) 
            ? data.GroupTaskAssignments.FirstOrDefault(a => a.TaskItemId == taskItem.Id && a.GroupId == groupId)
            : null;

        var parameterValues = assignment?.TaskParameterValues ?? new Dictionary<string, string?>();
        
        // TaskItem'dan parametre tanımlarını al
        // Scoped service kullanıyorsak, scoped DbContext'ten direkt al (dispose sorununu önlemek için)
        List<TaskParameter>? taskParameters = null;
        if (dataService != null && _serviceScopeFactory != null)
        {
            // Scoped DbContext'i kullanarak parametreleri al
            // GetDataAsync() içinde Include kullanıldığında, DbContext dispose edildikten sonra lazy loading çalışmaya çalışıyor
            // Bu yüzden scoped DbContext'i direkt kullanmalıyız
            using var scope = _serviceScopeFactory.CreateScope();
            var scopedDbContext = scope.ServiceProvider.GetService<TaskDbContext>();
            if (scopedDbContext != null)
            {
                taskParameters = await scopedDbContext.TaskParameters
                    .Where(p => p.TaskItemId == taskItem.Id)
                    .OrderBy(p => p.Order)
                    .ToListAsync();
            }
        }
        
        // Eğer taskParameters hala null ise, dataService'ten al (fallback)
        if (taskParameters == null)
        {
            var taskItemWithParams = data.TaskItems.FirstOrDefault(t => t.Id == taskItem.Id);
            if (taskItemWithParams != null && taskItemWithParams.Parameters != null && taskItemWithParams.Parameters.Count > 0)
            {
                // Parameters zaten memory'de yüklenmişse kullan
                taskParameters = taskItemWithParams.Parameters
                    .OrderBy(p => p.Order)
                    .ToList();
            }
        }
        
        // Eğer hala null ise, _dbContext'ten al (son fallback)
        if (taskParameters == null && _dbContext != null)
        {
            // DbContext kullanarak parametreleri al
            taskParameters = await _dbContext.TaskParameters
                .Where(p => p.TaskItemId == taskItem.Id)
                .OrderBy(p => p.Order)
                .ToListAsync();
        }
        
        // Hala null ise boş liste oluştur
        if (taskParameters == null)
        {
            Console.WriteLine($"[SP Execution] WARNING: No parameters found for TaskItem {taskItem.Id} (SP: {taskItem.StoredProcedureName})");
            taskParameters = new List<TaskParameter>();
        }
        
        Console.WriteLine($"[SP Execution] Loaded {taskParameters.Count} parameters for TaskItem {taskItem.Id}");

        // Connection string oluştur
        if (!_dbConfig.UseDatabase || string.IsNullOrEmpty(_dbConfig.Server))
        {
            throw new InvalidOperationException("Database configuration not available for SP execution");
        }

        var connectionString = $"Server={_dbConfig.Server};Database={_dbConfig.Database};User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
        
        using var connection = new Microsoft.Data.SqlClient.SqlConnection(connectionString);
        await connection.OpenAsync();

        // SP adını oluştur
        var schema = taskItem.StoredProcedureSchema ?? "dbo";
        var spName = $"[{schema}].[{taskItem.StoredProcedureName}]";

        // SQL fonksiyonu içeren parametreler var mı kontrol et
        bool hasSqlFunctions = false;
        if (taskParameters != null)
        {
            foreach (var param in taskParameters)
            {
                var paramName = param.ParameterName.StartsWith("@") ? param.ParameterName : $"@{param.ParameterName}";
                string? paramValue = null;
                
                if (parameterValues.ContainsKey(param.ParameterName))
                    paramValue = parameterValues[param.ParameterName];
                else if (parameterValues.ContainsKey(paramName))
                    paramValue = parameterValues[paramName];
                else if (!string.IsNullOrEmpty(param.DefaultValue))
                    paramValue = param.DefaultValue;
                
                if (!string.IsNullOrEmpty(paramValue) && 
                    !paramValue.Equals("NULL", StringComparison.OrdinalIgnoreCase) &&
                    IsSqlExpression(paramValue.Trim()))
                {
                    hasSqlFunctions = true;
                    break;
                }
            }
        }

        Microsoft.Data.SqlClient.SqlCommand command;
        
        // SQL fonksiyonları varsa dinamik SQL kullan
        if (hasSqlFunctions)
        {
            // Dinamik SQL oluştur - SQL fonksiyonları için değişkenler kullan
            var declareStatements = new System.Text.StringBuilder();
            var paramList = new System.Text.StringBuilder();
            var paramIndex = 0;
            var varIndex = 0;
            
            if (taskParameters != null)
            {
                foreach (var param in taskParameters)
                {
                    var paramName = param.ParameterName.StartsWith("@") ? param.ParameterName : $"@{param.ParameterName}";
                    string? paramValue = null;
                    bool isExplicitNull = false;
                    bool isSqlFunction = false;
                    
                    if (parameterValues.ContainsKey(param.ParameterName))
                    {
                        paramValue = parameterValues[param.ParameterName];
                        isExplicitNull = paramValue?.Equals("NULL", StringComparison.OrdinalIgnoreCase) == true;
                        // TODAY ve YESTERDAY özel değerlerini SQL ifadelerine çevir
                        if (!isExplicitNull && !string.IsNullOrEmpty(paramValue))
                        {
                            paramValue = ConvertSpecialDateValue(paramValue.Trim(), param.ParameterType);
                            isSqlFunction = IsSqlExpression(paramValue);
                        }
                    }
                    else if (parameterValues.ContainsKey(paramName))
                    {
                        paramValue = parameterValues[paramName];
                        isExplicitNull = paramValue?.Equals("NULL", StringComparison.OrdinalIgnoreCase) == true;
                        if (!isExplicitNull && !string.IsNullOrEmpty(paramValue))
                        {
                            paramValue = ConvertSpecialDateValue(paramValue.Trim(), param.ParameterType);
                            isSqlFunction = IsSqlExpression(paramValue);
                        }
                    }
                    else if (!string.IsNullOrEmpty(param.DefaultValue))
                    {
                        paramValue = param.DefaultValue;
                        if (!string.IsNullOrEmpty(paramValue))
                        {
                            paramValue = ConvertSpecialDateValue(paramValue.Trim(), param.ParameterType);
                            isSqlFunction = IsSqlExpression(paramValue);
                        }
                    }
                    
                    // Nullable olmayan parametreler için null ve boş değer kontrolü
                    if (!param.IsNullable)
                    {
                        if (isExplicitNull)
                        {
                            throw new InvalidOperationException(
                                $"Parametre '{param.ParameterName}' (Tip: {param.ParameterType}) nullable değildir ve NULL değer alamaz. " +
                                $"Lütfen geçerli bir değer girin.");
                        }
                        
                        // Boş string veya null değer kontrolü (default değer yoksa)
                        if (string.IsNullOrWhiteSpace(paramValue) && string.IsNullOrWhiteSpace(param.DefaultValue))
                        {
                            throw new InvalidOperationException(
                                $"Zorunlu parametre '{param.ParameterName}' (Tip: {param.ParameterType}) için değer girilmedi. " +
                                $"Lütfen grup yapılandırmasından bu parametre için bir değer girin.");
                        }
                    }
                    
                    // UniqueIdentifier tipi için GUID formatı kontrolü
                    if (!string.IsNullOrEmpty(paramValue) && !isExplicitNull && !isSqlFunction)
                    {
                        var typeLower = param.ParameterType.ToLower();
                        if (typeLower == "uniqueidentifier")
                        {
                            if (!System.Guid.TryParse(paramValue.Trim(), out _))
                            {
                                throw new InvalidOperationException(
                                    $"Parametre '{param.ParameterName}' UniqueIdentifier tipindedir ancak geçersiz GUID formatı: '{paramValue}'. " +
                                    $"Geçerli format: 550e8400-e29b-41d4-a716-446655440000");
                            }
                        }
                    }
                    
                    if (paramIndex > 0) paramList.Append(", ");
                    
                    if (isSqlFunction)
                    {
                        // SQL fonksiyonunu değişkene atayarak kullan (güvenlik: sadece izin verilen fonksiyonlar)
                        if (paramValue != null && IsAllowedSqlExpression(paramValue.Trim()))
                        {
                            // Değişken adı oluştur
                            var varName = $"@sqlVar{varIndex}";
                            varIndex++;
                            
                            // SQL tipini belirle (ParameterType'dan)
                            var sqlType = GetSqlTypeForDeclare(param.ParameterType);
                            
                            // DECLARE ifadesi ekle
                            declareStatements.AppendLine($"DECLARE {varName} {sqlType} = {paramValue};");
                            
                            // Parametre listesine değişkeni ekle
                            paramList.Append($"{paramName} = {varName}");
                        }
                        else
                        {
                            throw new InvalidOperationException(
                                $"SQL ifadesi '{paramValue}' izin verilen ifadeler listesinde değil. " +
                                $"İzin verilen ifadeler: getdate(), getutcdate(), sysdatetime(), sysutcdatetime(), current_timestamp, CAST(...), CONVERT(...)");
                        }
                    }
                    else if (isExplicitNull || (string.IsNullOrWhiteSpace(paramValue) && string.IsNullOrWhiteSpace(param.DefaultValue)))
                    {
                        // Sadece nullable parametreler için NULL atanabilir
                        if (param.IsNullable)
                        {
                            paramList.Append($"{paramName} = NULL");
                        }
                        else
                        {
                            // Bu durum zaten yukarıdaki kontrollerde yakalanmalı, ama yine de kontrol edelim
                            throw new InvalidOperationException(
                                $"Parametre '{param.ParameterName}' (Tip: {param.ParameterType}) nullable değildir ve NULL değer alamaz. " +
                                $"Lütfen geçerli bir değer girin.");
                        }
                    }
                    else
                    {
                        paramList.Append($"{paramName} = @param{paramIndex}");
                    }
                    
                    paramIndex++;
                }
            }
            
            // Dinamik SQL oluştur: DECLARE ifadeleri + EXEC
            var dynamicSql = new System.Text.StringBuilder();
            if (declareStatements.Length > 0)
            {
                dynamicSql.Append(declareStatements.ToString());
            }
            dynamicSql.Append($"EXEC {spName} {paramList}");
            
            command = new Microsoft.Data.SqlClient.SqlCommand(dynamicSql.ToString(), connection);
            command.CommandType = System.Data.CommandType.Text;
            command.CommandTimeout = 10800; // 3 saat (10800 saniye)
        }
        else
        {
            command = new Microsoft.Data.SqlClient.SqlCommand(spName, connection);
            command.CommandType = System.Data.CommandType.StoredProcedure;
            command.CommandTimeout = 10800; // 3 saat (10800 saniye)
        }

        // Parametreleri ekle
        if (taskParameters != null)
        {
            foreach (var param in taskParameters)
            {
                var paramName = param.ParameterName.StartsWith("@") ? param.ParameterName : $"@{param.ParameterName}";
                
                // Parametre değerini al (assignment'tan veya default değerden)
                string? paramValue = null;
                bool isExplicitNull = false;
                bool isSqlFunction = false;
                
                if (parameterValues.ContainsKey(param.ParameterName))
                {
                    paramValue = parameterValues[param.ParameterName];
                    isExplicitNull = paramValue?.Equals("NULL", StringComparison.OrdinalIgnoreCase) == true;
                    // TODAY ve YESTERDAY özel değerlerini SQL ifadelerine çevir
                    if (!isExplicitNull && !string.IsNullOrEmpty(paramValue))
                    {
                        paramValue = ConvertSpecialDateValue(paramValue.Trim(), param.ParameterType);
                        isSqlFunction = IsSqlExpression(paramValue);
                    }
                }
                else if (parameterValues.ContainsKey(paramName))
                {
                    paramValue = parameterValues[paramName];
                    isExplicitNull = paramValue?.Equals("NULL", StringComparison.OrdinalIgnoreCase) == true;
                    if (!isExplicitNull && !string.IsNullOrEmpty(paramValue))
                    {
                        paramValue = ConvertSpecialDateValue(paramValue.Trim(), param.ParameterType);
                        isSqlFunction = IsSqlExpression(paramValue);
                    }
                }
                else if (!string.IsNullOrEmpty(param.DefaultValue))
                {
                    paramValue = param.DefaultValue;
                    if (!string.IsNullOrEmpty(paramValue))
                    {
                        paramValue = ConvertSpecialDateValue(paramValue.Trim(), param.ParameterType);
                        isSqlFunction = IsSqlExpression(paramValue);
                    }
                }

                // Nullable olmayan parametreler için null ve boş değer kontrolü
                if (!param.IsNullable)
                {
                    if (isExplicitNull)
                    {
                        throw new InvalidOperationException(
                            $"Parametre '{param.ParameterName}' (Tip: {param.ParameterType}) nullable değildir ve NULL değer alamaz. " +
                            $"Lütfen geçerli bir değer girin.");
                    }
                    
                    // Boş string veya null değer kontrolü (default değer yoksa)
                    if (string.IsNullOrWhiteSpace(paramValue) && string.IsNullOrWhiteSpace(param.DefaultValue))
                {
                    throw new InvalidOperationException(
                        $"Zorunlu parametre '{param.ParameterName}' (Tip: {param.ParameterType}) için değer girilmedi. " +
                        $"Lütfen grup yapılandırmasından bu parametre için bir değer girin.");
                    }
                }
                
                // UniqueIdentifier tipi için GUID formatı kontrolü
                if (!string.IsNullOrWhiteSpace(paramValue) && !isExplicitNull && !isSqlFunction)
                {
                    var typeLower = param.ParameterType.ToLower();
                    if (typeLower == "uniqueidentifier")
                    {
                        if (!System.Guid.TryParse(paramValue.Trim(), out _))
                        {
                            throw new InvalidOperationException(
                                $"Parametre '{param.ParameterName}' UniqueIdentifier tipindedir ancak geçersiz GUID formatı: '{paramValue}'. " +
                                $"Geçerli format: 550e8400-e29b-41d4-a716-446655440000");
                        }
                    }
                }

                // SQL fonksiyonu değilse parametreyi ekle
                // Normal SP yolu kullanıldığında (hasSqlFunctions = false), TÜM parametreler eklenmeli
                // Dinamik SQL yolu kullanıldığında (hasSqlFunctions = true), sadece SQL fonksiyonu olmayan parametreler eklenir
                if (!isSqlFunction)
                {
                    // Parametre değerini belirle: önce parametre değeri, sonra default değer
                    // NOT: isExplicitNull true ise, paramValue "NULL" string'i olacak, bu durumda finalParamValue null kalmalı
                    string? finalParamValue = null;
                    if (isExplicitNull)
                    {
                        // NULL olarak işaretlenmiş, finalParamValue null kalacak
                        finalParamValue = null;
                    }
                    else if (!string.IsNullOrWhiteSpace(paramValue))
                    {
                        finalParamValue = paramValue;
                    }
                    else if (!string.IsNullOrWhiteSpace(param.DefaultValue))
                    {
                        finalParamValue = param.DefaultValue;
                    }
                    
                    // Normal SP yolu kullanıldığında, nullable olmayan parametreler için mutlaka değer olmalı
                    if (!hasSqlFunctions && !param.IsNullable && string.IsNullOrWhiteSpace(finalParamValue))
                    {
                        // Bu durum zaten yukarıdaki kontrollerde yakalanmalı, ama yine de kontrol edelim
                        throw new InvalidOperationException(
                            $"Zorunlu parametre '{param.ParameterName}' (Tip: {param.ParameterType}) için değer girilmedi. " +
                            $"Lütfen grup yapılandırmasından bu parametre için bir değer girin.");
                    }
                    
                    // Normal SP yolu kullanıldığında, TÜM parametreler eklenmeli (nullable olsun ya da olmasın)
                    // SQL Server, normal SP yolu kullanıldığında TÜM parametrelerin command'da olmasını bekliyor
                    // Dinamik SQL yolu kullanıldığında, sadece değeri olan parametreler eklenir
                    // Normal SP yolu için: Her zaman ekle (SQL Server bunu bekliyor)
                    // Dinamik SQL yolu için: Sadece değeri olan veya NULL olarak işaretlenen parametreler eklenir
                    if (!hasSqlFunctions || !string.IsNullOrWhiteSpace(finalParamValue) || isExplicitNull || (param.IsNullable && string.IsNullOrWhiteSpace(finalParamValue)))
                    {
                        var sqlParamName = hasSqlFunctions ? $"@param{taskParameters.IndexOf(param)}" : paramName;
                        var sqlParam = new Microsoft.Data.SqlClient.SqlParameter(
                            sqlParamName, 
                            GetSqlDbType(param.ParameterType))
                        {
                            // NULL değer kontrolü: isExplicitNull true ise veya nullable ise ve değer yoksa DBNull.Value
                            Value = (isExplicitNull || (string.IsNullOrWhiteSpace(finalParamValue) && param.IsNullable)) 
                                ? DBNull.Value 
                                : ConvertParameterValue(finalParamValue ?? param.DefaultValue ?? string.Empty, param.ParameterType),
                    Direction = System.Data.ParameterDirection.Input
                };

                if (param.MaxLength.HasValue && param.MaxLength.Value > 0)
                {
                    sqlParam.Size = param.MaxLength.Value;
                }

                command.Parameters.Add(sqlParam);
                        Console.WriteLine($"[SP Execution] Added parameter: {sqlParamName} = {(sqlParam.Value == DBNull.Value ? "NULL" : sqlParam.Value?.ToString() ?? "null")} (Type: {param.ParameterType}, IsNullable: {param.IsNullable})");
                    }
                    else
                    {
                        Console.WriteLine($"[SP Execution] Skipped parameter: {paramName} (hasSqlFunctions: {hasSqlFunctions}, finalParamValue: {finalParamValue ?? "null"}, isExplicitNull: {isExplicitNull}, IsNullable: {param.IsNullable})");
                    }
                }
            }
        }

        // CommandTimeout'u parametrelerden SONRA tekrar ayarla (güvenlik için)
        command.CommandTimeout = 10800; // 3 saat (10800 saniye)

        // SP'yi çalıştır
        Console.WriteLine($"[SP Execution] Executing {spName} with {command.Parameters.Count} parameters, CommandTimeout: {command.CommandTimeout} seconds");
        await command.ExecuteNonQueryAsync();
        
        // Başarılı olduysa task'ı tamamla - scoped service kullan
        if (dataService != null && _serviceScopeFactory != null)
        {
            using var scope = _serviceScopeFactory.CreateScope();
            var scopedTaskManagementService = scope.ServiceProvider.GetRequiredService<ITaskManagementService>();
            await scopedTaskManagementService.CompleteTaskItemAsync(taskItem.Id, groupId);
        }
        else
        {
            await CompleteTaskItemAsync(taskItem.Id, groupId);
        }
        Console.WriteLine($"[SP Execution] Successfully executed {spName}");
    }

    /// <summary>
    /// SQL tipini System.Data.SqlDbType'a dönüştürür
    /// </summary>
    private System.Data.SqlDbType GetSqlDbType(string sqlType)
    {
        var typeLower = sqlType.ToLower();
        return typeLower switch
        {
            "int" => System.Data.SqlDbType.Int,
            "bigint" => System.Data.SqlDbType.BigInt,
            "smallint" => System.Data.SqlDbType.SmallInt,
            "tinyint" => System.Data.SqlDbType.TinyInt,
            "bit" => System.Data.SqlDbType.Bit,
            "decimal" or "numeric" => System.Data.SqlDbType.Decimal,
            "money" => System.Data.SqlDbType.Money,
            "smallmoney" => System.Data.SqlDbType.SmallMoney,
            "float" => System.Data.SqlDbType.Float,
            "real" => System.Data.SqlDbType.Real,
            "datetime" or "datetime2" => System.Data.SqlDbType.DateTime2,
            "date" => System.Data.SqlDbType.Date,
            "time" => System.Data.SqlDbType.Time,
            "smalldatetime" => System.Data.SqlDbType.SmallDateTime,
            "datetimeoffset" => System.Data.SqlDbType.DateTimeOffset,
            "char" or "nchar" => System.Data.SqlDbType.NChar,
            "varchar" or "nvarchar" => System.Data.SqlDbType.NVarChar,
            "text" or "ntext" => System.Data.SqlDbType.NText,
            "uniqueidentifier" => System.Data.SqlDbType.UniqueIdentifier,
            "xml" => System.Data.SqlDbType.Xml,
            _ => System.Data.SqlDbType.NVarChar
        };
    }

    /// <summary>
    /// Parametre değerini SQL tipine göre dönüştürür
    /// </summary>
    private object ConvertParameterValue(string value, string sqlType)
    {
        var typeLower = sqlType.ToLower();
        
        if (typeLower.Contains("datetime") || typeLower == "date" || typeLower == "time")
        {
            if (DateTime.TryParse(value, out var dateValue))
            {
                return dateValue;
            }
        }
        else if (typeLower.Contains("int") || typeLower == "bigint" || typeLower == "smallint" || typeLower == "tinyint")
        {
            if (long.TryParse(value, out var intValue))
            {
                return intValue;
            }
        }
        else if (typeLower == "bit")
        {
            if (bool.TryParse(value, out var boolValue))
            {
                return boolValue;
            }
            if (int.TryParse(value, out var intBoolValue))
            {
                return intBoolValue != 0;
            }
        }
        else if (typeLower.Contains("decimal") || typeLower == "numeric" || typeLower == "float" || typeLower == "real" || typeLower == "money")
        {
            if (decimal.TryParse(value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var decimalValue))
            {
                return decimalValue;
            }
        }
        else if (typeLower == "uniqueidentifier")
        {
            if (Guid.TryParse(value, out var guidValue))
            {
                return guidValue;
            }
        }
        
        // Varsayılan olarak string döndür
        return value;
    }

    /// <summary>
    /// Bir değerin SQL ifadesi olup olmadığını kontrol eder
    /// </summary>
    private bool IsSqlExpression(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        
        // Basit SQL fonksiyonları: getdate(), getutcdate(), vb.
        if (System.Text.RegularExpressions.Regex.IsMatch(trimmed, 
            @"^[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)$"))
        {
            return true;
        }
        
        // CAST ve CONVERT ifadeleri: CAST(GETDATE() AS date), CONVERT(date, GETDATE()), vb.
        if (System.Text.RegularExpressions.Regex.IsMatch(trimmed, 
            @"^(CAST|CONVERT)\s*\(.*\)", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            return true;
        }
        
        return false;
    }

    /// <summary>
    /// Bir SQL ifadesinin izin verilen ifadeler listesinde olup olmadığını kontrol eder
    /// </summary>
    private bool IsAllowedSqlExpression(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var trimmed = value.Trim();
        
        // İzin verilen basit fonksiyonlar
        var allowedFunctions = new[] { "getdate", "getutcdate", "sysdatetime", "sysutcdatetime", "current_timestamp","dateadd" };
        var funcName = trimmed.Split('(')[0].Trim().ToLower();
        if (allowedFunctions.Contains(funcName))
        {
            return true;
        }
        
        // CAST ve CONVERT ifadeleri - içinde sadece izin verilen fonksiyonlar olmalı
        if (System.Text.RegularExpressions.Regex.IsMatch(trimmed, 
            @"^(CAST|CONVERT)\s*\(.*\)", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            // CAST/CONVERT içinde sadece izin verilen fonksiyonlar olmalı
            var innerMatch = System.Text.RegularExpressions.Regex.Match(trimmed, 
                @"(CAST|CONVERT)\s*\((.*?)\)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (innerMatch.Success && innerMatch.Groups.Count > 2)
            {
                var innerExpression = innerMatch.Groups[2].Value;
                // İç ifadede sadece izin verilen fonksiyonlar veya basit değerler olmalı
                foreach (var allowedFunc in allowedFunctions)
                {
                    if (innerExpression.ToLower().Contains(allowedFunc + "(") || 
                        innerExpression.ToLower().Contains(allowedFunc.ToUpper() + "("))
                    {
                        return true;
                    }
                }
                // CAST(GETDATE() AS date) gibi ifadeler
                if (System.Text.RegularExpressions.Regex.IsMatch(innerExpression, 
                    @"GETDATE\s*\(\)", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                {
                    return true;
                }
            }
        }
        
        return false;
    }

    /// <summary>
    /// Özel tarih değerlerini (TODAY, YESTERDAY) SQL ifadelerine çevirir
    /// </summary>
    private string ConvertSpecialDateValue(string value, string parameterType)
    {
        if (string.IsNullOrWhiteSpace(value))
            return value;

        var trimmed = value.Trim();
        var typeLower = parameterType.ToLower();

        // Sadece date tipi parametreler için özel değerleri çevir
        if (typeLower.Contains("date") && !typeLower.Contains("time"))
        {
            if (trimmed.Equals("TODAY", StringComparison.OrdinalIgnoreCase))
            {
                return "CAST(GETDATE() AS date)";
            }
            else if (trimmed.Equals("YESTERDAY", StringComparison.OrdinalIgnoreCase))
            {
                return "CAST(DATEADD(day, -1, GETDATE()) AS date)";
            }
        }

        return value;
    }

    /// <summary>
    /// SQL tipini DECLARE ifadesi için uygun formata dönüştürür
    /// </summary>
    private string GetSqlTypeForDeclare(string sqlType)
    {
        if (string.IsNullOrWhiteSpace(sqlType))
            return "NVARCHAR(MAX)";
        
        var typeLower = sqlType.ToLower().Trim();
        
        // Tip adını temizle (parantez içindeki bilgileri koru)
        // Örn: "nvarchar(50)" -> "NVARCHAR(50)", "int" -> "INT"
        var parts = typeLower.Split('(');
        var baseType = parts[0].Trim();
        
        // Base type'ı büyük harfe çevir
        var upperBaseType = baseType.ToUpper();
        
        // Özel durumlar
        if (upperBaseType == "NVARCHAR" && !typeLower.Contains("("))
        {
            return "NVARCHAR(MAX)";
        }
        if (upperBaseType == "VARCHAR" && !typeLower.Contains("("))
        {
            return "VARCHAR(MAX)";
        }
        
        // Parantez varsa koru
        if (parts.Length > 1)
        {
            return $"{upperBaseType}({string.Join("(", parts.Skip(1))}";
        }
        
        // Standart tipler
        return upperBaseType switch
        {
            "int" => "INT",
            "bigint" => "BIGINT",
            "smallint" => "SMALLINT",
            "tinyint" => "TINYINT",
            "bit" => "BIT",
            "decimal" => "DECIMAL(18,2)",
            "numeric" => "NUMERIC(18,2)",
            "money" => "MONEY",
            "smallmoney" => "SMALLMONEY",
            "float" => "FLOAT",
            "real" => "REAL",
            "datetime" => "DATETIME",
            "datetime2" => "DATETIME2",
            "date" => "DATE",
            "time" => "TIME",
            "smalldatetime" => "SMALLDATETIME",
            "datetimeoffset" => "DATETIMEOFFSET",
            "char" => "CHAR(1)",
            "nchar" => "NCHAR(1)",
            "varchar" => "VARCHAR(MAX)",
            "nvarchar" => "NVARCHAR(MAX)",
            "text" => "TEXT",
            "ntext" => "NTEXT",
            "uniqueidentifier" => "UNIQUEIDENTIFIER",
            "xml" => "XML",
            _ => sqlType.ToUpper() // Orijinal tipi büyük harfe çevir
        };
    }

}

