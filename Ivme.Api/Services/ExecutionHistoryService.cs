using Ivme.Api.Models;
using Ivme.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Ivme.Api.Services;

public class ExecutionHistoryService : IExecutionHistoryService
{
    private readonly TaskDbContext? _dbContext;
    private readonly DatabaseConfig _dbConfig;
    private readonly ITaskDataService? _dataService;
    private readonly Dictionary<string, TaskExecutionHistory> _activeTaskExecutions = new(); // TaskItemId -> ExecutionHistory
    private readonly Dictionary<string, GroupExecutionHistory> _activeGroupExecutions = new(); // GroupId -> ExecutionHistory

    public ExecutionHistoryService(DatabaseConfig dbConfig, TaskDbContext? dbContext = null, ITaskDataService? dataService = null)
    {
        _dbConfig = dbConfig;
        _dbContext = dbContext;
        _dataService = dataService;
    }

    private TaskDbContext? GetDbContext()
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
            return null;
        return _dbContext;
    }
    
    // Public metod - TaskManagementService'ten erişim için
    public TaskDbContext? GetDbContextPublic() => GetDbContext();

    public async Task<TaskExecutionHistory> StartTaskExecutionAsync(string taskItemId, string? groupId = null, string? groupExecutionId = null, Dictionary<string, string?>? taskParameterValues = null, string? triggeredBy = null)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda - sadece memory'de tut
            // RetryCount hesaplama (JSON modunda önceki execution'ları kontrol edemeyiz, bu yüzden 0 olarak başlatıyoruz)
            var history = new TaskExecutionHistory
            {
                TaskItemId = taskItemId,
                GroupId = groupId,
                GroupExecutionId = groupExecutionId,
                StartTime = DateTime.Now,
                FinalStatus = TaskItemStatus.Running,
                RetryCount = 0, // JSON modunda retry sayısını takip edemeyiz
                TaskParameterValues = taskParameterValues ?? new Dictionary<string, string?>(),
                TriggeredBy = triggeredBy
            };
            _activeTaskExecutions[taskItemId] = history;
            return history;
        }

        // Veritabanı modunda
        // ÖNEMLİ: Eğer zaten bir Running execution varsa, duplicate execution'ı önle
        if (!string.IsNullOrEmpty(groupExecutionId))
        {
            var existingRunningExecution = await dbContext.TaskExecutionHistories
                .Where(e => e.TaskItemId == taskItemId && 
                           e.GroupId == groupId &&
                           e.GroupExecutionId == groupExecutionId &&
                           e.FinalStatus == TaskItemStatus.Running &&
                           e.EndTime == null)
                .FirstOrDefaultAsync();
            
            if (existingRunningExecution != null)
            {
                Console.WriteLine($"[StartTaskExecutionAsync] Task {taskItemId} in group {groupId} already has a Running execution {existingRunningExecution.Id}, skipping duplicate start");
                _activeTaskExecutions[taskItemId] = existingRunningExecution;
                return existingRunningExecution;
            }
            
            // ÖNEMLİ: Eğer zaten bir Pending kaydı varsa, onu güncelle; yoksa yeni kayıt oluştur
            var existingPendingExecution = await dbContext.TaskExecutionHistories
                .Where(e => e.TaskItemId == taskItemId && 
                           e.GroupId == groupId &&
                           e.GroupExecutionId == groupExecutionId &&
                           e.FinalStatus == TaskItemStatus.Pending)
                .FirstOrDefaultAsync();

            if (existingPendingExecution != null)
            {
                // Pending kaydı varsa, onu Running durumuna güncelle
                // ÖNEMLİ: Eğer retry ise (WaitingRetry durumundan geliyorsa), önceki execution'ın RetryCount'unu alıp +1 yap
                if (existingPendingExecution.RetryCount == 0 && !string.IsNullOrEmpty(groupId))
                {
                    // Bugün başlamış en son Failed veya WaitingRetry execution'ı bul
                    var today = DateTime.Now.Date;
                    var previousExecution = await dbContext.TaskExecutionHistories
                        .Where(e => e.TaskItemId == taskItemId && 
                               e.GroupId == groupId &&
                               e.StartTime.Date == today &&
                               e.Id != existingPendingExecution.Id &&
                               (e.FinalStatus == TaskItemStatus.Failed || e.FinalStatus == TaskItemStatus.WaitingRetry))
                        .OrderByDescending(e => e.StartTime)
                        .FirstOrDefaultAsync();
                    
                    if (previousExecution != null)
                    {
                        existingPendingExecution.RetryCount = previousExecution.RetryCount + 1;
                        Console.WriteLine($"[StartTaskExecutionAsync] Retry detected for pending execution {existingPendingExecution.Id}: Previous RetryCount={previousExecution.RetryCount}, New RetryCount={existingPendingExecution.RetryCount}");
                    }
                }
                
                existingPendingExecution.FinalStatus = TaskItemStatus.Running;
                existingPendingExecution.StartTime = DateTime.Now;
                existingPendingExecution.Progress = 0;
                existingPendingExecution.ErrorMessage = null;
                existingPendingExecution.ErrorCount = 0;
                existingPendingExecution.RetryStartTime = null;
                existingPendingExecution.TaskParameterValues = taskParameterValues ?? new Dictionary<string, string?>();
                if (triggeredBy != null)
                {
                    existingPendingExecution.TriggeredBy = triggeredBy;
                }
                
                await dbContext.SaveChangesAsync();
                
                _activeTaskExecutions[taskItemId] = existingPendingExecution;
                return existingPendingExecution;
            }
        }

        // Pending kaydı yoksa, yeni kayıt oluştur
        // ÖNEMLİ: Eğer retry ise (WaitingRetry durumundan geliyorsa), önceki execution'ın RetryCount'unu alıp +1 yap
        int retryCount = 0;
        if (!string.IsNullOrEmpty(groupId))
        {
            // Bugün başlamış en son Failed veya WaitingRetry execution'ı bul
            var today = DateTime.Now.Date;
            var previousExecution = await dbContext.TaskExecutionHistories
                .Where(e => e.TaskItemId == taskItemId && 
                       e.GroupId == groupId &&
                       e.StartTime.Date == today &&
                       (e.FinalStatus == TaskItemStatus.Failed || e.FinalStatus == TaskItemStatus.WaitingRetry))
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefaultAsync();
            
            if (previousExecution != null)
            {
                retryCount = previousExecution.RetryCount + 1;
                Console.WriteLine($"[StartTaskExecutionAsync] Retry detected for task {taskItemId} in group {groupId}: Previous RetryCount={previousExecution.RetryCount}, New RetryCount={retryCount}");
            }
        }
        
        var execution = new TaskExecutionHistory
        {
            TaskItemId = taskItemId,
            GroupId = groupId,
            GroupExecutionId = groupExecutionId,
            StartTime = DateTime.Now,
            FinalStatus = TaskItemStatus.Running,
            RetryCount = retryCount,
            TaskParameterValues = taskParameterValues ?? new Dictionary<string, string?>(),
            TriggeredBy = triggeredBy
        };

        dbContext.TaskExecutionHistories.Add(execution);
        await dbContext.SaveChangesAsync();
        
        _activeTaskExecutions[taskItemId] = execution;
        return execution;
    }

    public async Task CompleteTaskExecutionAsync(string executionId, TaskItemStatus finalStatus, int progress)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda
            var execution = _activeTaskExecutions.Values.FirstOrDefault(e => e.Id == executionId);
            if (execution != null)
            {
                execution.EndTime = DateTime.Now;
                execution.FinalStatus = finalStatus;
                execution.Progress = progress;
                _activeTaskExecutions.Remove(execution.TaskItemId);
            }
            return;
        }

        var executionDb = await dbContext.TaskExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
        if (executionDb != null)
        {
            // ÖNEMLİ: EndTime zaten set edilmiş olsa bile (Failed task'lar için), FinalStatus'u güncelle
            // EndTime'ı da güncelle (bugünün tarihine) ki UI bugünün execution'larını görebilsin
            executionDb.EndTime = DateTime.Now;
            executionDb.FinalStatus = finalStatus;
            executionDb.Progress = progress;
            // ErrorMessage'ı temizle (Completed veya MarkedAsSuccess olarak işaretleniyor)
            executionDb.ErrorMessage = null;
            
            try
            {
                await dbContext.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                // Hata durumunda logla
                Console.WriteLine($"[CompleteTaskExecutionAsync] Error saving execution {executionId}: {ex.Message}");
                throw;
            }
            
            if (_activeTaskExecutions.ContainsKey(executionDb.TaskItemId))
            {
                _activeTaskExecutions.Remove(executionDb.TaskItemId);
            }
        }
        else
        {
            // Execution bulunamadı - logla
            Console.WriteLine($"[CompleteTaskExecutionAsync] Execution not found: {executionId}");
        }
    }

    public async Task FailTaskExecutionAsync(string executionId, string errorMessage)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda
            var execution = _activeTaskExecutions.Values.FirstOrDefault(e => e.Id == executionId);
            if (execution != null)
            {
                execution.EndTime = DateTime.Now;
                execution.FinalStatus = TaskItemStatus.Failed;
                execution.ErrorMessage = errorMessage;
                execution.LastErrorTime = DateTime.Now;
                execution.ErrorCount++;
                _activeTaskExecutions.Remove(execution.TaskItemId);
            }
            return;
        }

        var executionDb = await dbContext.TaskExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
        if (executionDb != null)
        {
            executionDb.EndTime = DateTime.Now;
            executionDb.FinalStatus = TaskItemStatus.Failed;
            executionDb.ErrorMessage = errorMessage;
            executionDb.LastErrorTime = DateTime.Now;
            executionDb.ErrorCount++;
            await dbContext.SaveChangesAsync();
            
            if (_activeTaskExecutions.ContainsKey(executionDb.TaskItemId))
            {
                _activeTaskExecutions.Remove(executionDb.TaskItemId);
            }
        }
    }

    public async Task IncrementTaskErrorCountAsync(string executionId, string errorMessage)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda
            var execution = _activeTaskExecutions.Values.FirstOrDefault(e => e.Id == executionId);
            if (execution != null)
            {
                execution.ErrorCount++;
                execution.ErrorMessage = errorMessage;
                execution.LastErrorTime = DateTime.Now;
            }
            return;
        }

        var executionDb = await dbContext.TaskExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
        if (executionDb != null)
        {
            executionDb.ErrorCount++;
            executionDb.ErrorMessage = errorMessage;
            executionDb.LastErrorTime = DateTime.Now;
            await dbContext.SaveChangesAsync();
        }
    }

    public async Task SetTaskRetryStartTimeAsync(string executionId, DateTime retryStartTime)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda
            var execution = _activeTaskExecutions.Values.FirstOrDefault(e => e.Id == executionId);
            if (execution != null)
            {
                execution.RetryStartTime = retryStartTime;
            }
            return;
        }

        var executionDb = await dbContext.TaskExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
        if (executionDb != null)
        {
            executionDb.RetryStartTime = retryStartTime;
            await dbContext.SaveChangesAsync();
        }
    }

    public async Task<GroupExecutionHistory> StartGroupExecutionAsync(string groupId, string triggeredBy = "Manual")
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda
            var history = new GroupExecutionHistory
            {
                GroupId = groupId,
                StartTime = DateTime.Now,
                TriggeredBy = triggeredBy
            };
            _activeGroupExecutions[groupId] = history;
            return history;
        }

        var execution = new GroupExecutionHistory
        {
            GroupId = groupId,
                StartTime = DateTime.Now,
            TriggeredBy = triggeredBy
        };

        dbContext.GroupExecutionHistories.Add(execution);
        await dbContext.SaveChangesAsync();
        
        _activeGroupExecutions[groupId] = execution;
        return execution;
    }

    public async Task CompleteGroupExecutionAsync(string executionId, int totalTasks, int completedTasks, int failedTasks, int totalErrors)
    {
        // ÖNEMLİ: EndTime sadece tüm task'lar tamamlandığında set edilir
        // Güvenlik kontrolü: Eğer tüm task'lar tamamlanmamışsa EndTime set etme
        if (totalTasks > 0 && (completedTasks + failedTasks) != totalTasks)
        {
            // Tüm task'lar tamamlanmamış, sadece sayıları güncelle ama EndTime set etme
            var dbContext = GetDbContext();
            if (dbContext == null)
            {
                // JSON modunda
                var execution = _activeGroupExecutions.Values.FirstOrDefault(e => e.Id == executionId);
                if (execution != null)
                {
                    execution.TotalTasks = totalTasks;
                    execution.CompletedTasks = completedTasks;
                    execution.FailedTasks = failedTasks;
                    execution.TotalErrors = totalErrors;
                    // EndTime set etme - tüm task'lar tamamlanmadı
                }
            }
            else
            {
                var executionDb = await dbContext.GroupExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
                if (executionDb != null)
                {
                    executionDb.TotalTasks = totalTasks;
                    executionDb.CompletedTasks = completedTasks;
                    executionDb.FailedTasks = failedTasks;
                    executionDb.TotalErrors = totalErrors;
                    // EndTime set etme - tüm task'lar tamamlanmadı
                    await dbContext.SaveChangesAsync();
                }
            }
            return;
        }
        
        // Tüm task'lar tamamlandı, EndTime'ı set et
        var dbContextForComplete = GetDbContext();
        if (dbContextForComplete == null)
        {
            // JSON modunda
            var execution = _activeGroupExecutions.Values.FirstOrDefault(e => e.Id == executionId);
            if (execution != null)
            {
                execution.EndTime = DateTime.Now;
                execution.TotalTasks = totalTasks;
                execution.CompletedTasks = completedTasks;
                execution.FailedTasks = failedTasks;
                execution.TotalErrors = totalErrors;
                _activeGroupExecutions.Remove(execution.GroupId);
            }
            return;
        }

        var executionDbComplete = await dbContextForComplete.GroupExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
        if (executionDbComplete != null)
        {
            executionDbComplete.EndTime = DateTime.Now;
            executionDbComplete.TotalTasks = totalTasks;
            executionDbComplete.CompletedTasks = completedTasks;
            executionDbComplete.FailedTasks = failedTasks;
            executionDbComplete.TotalErrors = totalErrors;
            await dbContextForComplete.SaveChangesAsync();
            
            if (_activeGroupExecutions.ContainsKey(executionDbComplete.GroupId))
            {
                _activeGroupExecutions.Remove(executionDbComplete.GroupId);
            }
        }
    }

    public async Task<List<TaskExecutionHistory>> GetTaskExecutionHistoriesAsync(string? taskItemId = null, string? groupId = null, DateTime? startDate = null, DateTime? endDate = null)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            return new List<TaskExecutionHistory>();
        }

        var query = dbContext.TaskExecutionHistories.AsQueryable();

        if (!string.IsNullOrEmpty(taskItemId))
        {
            query = query.Where(e => e.TaskItemId == taskItemId);
        }

        if (!string.IsNullOrEmpty(groupId))
        {
            query = query.Where(e => e.GroupId == groupId);
        }

        if (startDate.HasValue)
        {
            query = query.Where(e => e.StartTime >= startDate.Value);
        }

        if (endDate.HasValue)
        {
            query = query.Where(e => e.StartTime <= endDate.Value);
        }

        return await query.OrderByDescending(e => e.StartTime).ToListAsync();
    }

    public async Task<List<GroupExecutionHistory>> GetGroupExecutionHistoriesAsync(string? groupId = null, DateTime? startDate = null, DateTime? endDate = null)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            return new List<GroupExecutionHistory>();
        }

        var query = dbContext.GroupExecutionHistories.AsQueryable();

        if (!string.IsNullOrEmpty(groupId))
        {
            query = query.Where(e => e.GroupId == groupId);
        }

        if (startDate.HasValue)
        {
            query = query.Where(e => e.StartTime >= startDate.Value);
        }

        if (endDate.HasValue)
        {
            query = query.Where(e => e.StartTime <= endDate.Value);
        }

        return await query.OrderByDescending(e => e.StartTime).ToListAsync();
    }

    public async Task<TaskExecutionHistory?> GetTaskExecutionHistoryAsync(string executionId)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            return _activeTaskExecutions.Values.FirstOrDefault(e => e.Id == executionId);
        }

        return await dbContext.TaskExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
    }

    public async Task<GroupExecutionHistory?> GetGroupExecutionHistoryAsync(string executionId)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            return _activeGroupExecutions.Values.FirstOrDefault(e => e.Id == executionId);
        }

        return await dbContext.GroupExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
    }

    // Aktif execution'ı task item ID'ye göre bul
    public async Task<TaskExecutionHistory?> GetActiveTaskExecutionAsync(string taskItemId)
    {
        if (_activeTaskExecutions.TryGetValue(taskItemId, out var execution))
        {
            return execution;
        }

        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.TaskExecutionHistories
                .Where(e => e.TaskItemId == taskItemId && e.EndTime == null)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefaultAsync();
        }

        return null;
    }

    // Aktif group execution'ı bul
    public async Task<GroupExecutionHistory?> GetActiveGroupExecutionAsync(string groupId)
    {
        if (_activeGroupExecutions.TryGetValue(groupId, out var execution))
        {
            return execution;
        }

        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.GroupExecutionHistories
                .Where(e => e.GroupId == groupId && e.EndTime == null)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefaultAsync();
        }

        return null;
    }

    // Bugün başlamış en son group execution'ı bul
    public async Task<GroupExecutionHistory?> GetLatestGroupExecutionTodayAsync(string groupId)
    {
        var todayStart = DateTime.Now.Date;
        var todayEnd = todayStart.AddDays(1);

        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda - aktif execution'lardan bugün başlamış olanı bul
            var latestGroupExecution = _activeGroupExecutions.Values
                .Where(e => e.GroupId == groupId && e.StartTime.Date == todayStart)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefault();
            return latestGroupExecution;
        }

        // Veritabanı modunda - bugün başlamış en son group execution'ı bul
        return await dbContext.GroupExecutionHistories
            .Where(e => e.GroupId == groupId && e.StartTime >= todayStart && e.StartTime < todayEnd)
            .OrderByDescending(e => e.StartTime)
            .FirstOrDefaultAsync();
    }
    
    /// <summary>
    /// Bugün başlamış ve henüz tamamlanmamış (EndTime null) group execution'ı bul
    /// </summary>
    public async Task<GroupExecutionHistory?> GetActiveGroupExecutionTodayAsync(string groupId)
    {
        var todayStart = DateTime.Now.Date;
        var todayEnd = todayStart.AddDays(1);

        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda - aktif execution'lardan bugün başlamış ve EndTime null olanı bul
            var activeGroupExecution = _activeGroupExecutions.Values
                .Where(e => e.GroupId == groupId && e.StartTime.Date == todayStart && e.EndTime == null)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefault();
            return activeGroupExecution;
        }

        // Veritabanı modunda - bugün başlamış ve EndTime null olan en son group execution'ı bul
        return await dbContext.GroupExecutionHistories
            .Where(e => e.GroupId == groupId && 
                       e.StartTime >= todayStart && 
                       e.StartTime < todayEnd &&
                       e.EndTime == null)
            .OrderByDescending(e => e.StartTime)
            .FirstOrDefaultAsync();
    }

    public async Task UpdateTaskExecutionStatusAsync(string executionId, TaskItemStatus status)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            // JSON modunda
            var execution = _activeTaskExecutions.Values.FirstOrDefault(e => e.Id == executionId);
            if (execution != null)
            {
                execution.FinalStatus = status;
                // Paused veya Pending durumunda EndTime set et (kayıt tamamlanmış sayılsın)
                if (status == TaskItemStatus.Paused || status == TaskItemStatus.Pending)
                {
                    execution.EndTime = DateTime.Now;
                }
            }
            return;
        }

        var executionDb = await dbContext.TaskExecutionHistories.FirstOrDefaultAsync(e => e.Id == executionId);
        if (executionDb != null)
        {
            executionDb.FinalStatus = status;
            // Paused veya Pending durumunda EndTime set et (kayıt tamamlanmış sayılsın)
            if (status == TaskItemStatus.Paused || status == TaskItemStatus.Pending)
            {
                executionDb.EndTime = DateTime.Now;
            }
            await dbContext.SaveChangesAsync();
        }
    }

    public async Task<Dictionary<string, TaskItemStatus>> GetTodayTaskStatusesByGroupAsync()
    {
        var dbContext = GetDbContext();
        var result = new Dictionary<string, TaskItemStatus>();
        
        if (_dataService == null)
        {
            return result;
        }

        // Tüm grupları al
        var data = await _dataService.GetDataAsync();
        var groups = data.Groups;
        var todayStart = DateTime.Now.Date;
        var todayEnd = todayStart.AddDays(1);

        if (dbContext == null)
        {
            // JSON modunda - aktif execution'lardan bugün başlamış olanları al
            // Her grup için bugün başlamış en son group execution'ı bul
            foreach (var group in groups)
            {
                // Bugün başlamış en son group execution'ı bul (aktif olanlar)
                var latestGroupExecution = _activeGroupExecutions.Values
                    .Where(e => e.GroupId == group.Id && e.StartTime.Date == todayStart)
                    .OrderByDescending(e => e.StartTime)
                    .FirstOrDefault();

                if (latestGroupExecution == null)
                {
                    // Bugün hiç başlamadı, tüm task'lar için statü boş (ekleme yapmıyoruz)
                    continue;
                }

                // Bu group execution'dan sonraki task execution'larını al
                var taskExecutions = _activeTaskExecutions.Values
                    .Where(e => e.GroupExecutionId == latestGroupExecution.Id && e.StartTime >= latestGroupExecution.StartTime)
                    .OrderByDescending(e => e.StartTime)
                    .ToList();

                // Her task için en son execution'ın statüsünü al
                var taskExecutionsByTaskId = taskExecutions
                    .GroupBy(e => e.TaskItemId)
                    .ToDictionary(g => g.Key, g => g.First());

                foreach (var kvp in taskExecutionsByTaskId)
                {
                    var key = $"{group.Id}-{kvp.Key}";
                    result[key] = kvp.Value.FinalStatus;
                }
            }
            return result;
        }

        // Veritabanı modunda
        // Her grup için bugün başlamış en son group execution'ı bul
        foreach (var group in groups)
        {
            // Bugün başlamış en son group execution'ı bul
            var latestGroupExecution = await dbContext.GroupExecutionHistories
                .Where(e => e.GroupId == group.Id && e.StartTime >= todayStart && e.StartTime < todayEnd)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefaultAsync();

            if (latestGroupExecution == null)
            {
                // Bugün hiç başlamadı, tüm task'lar için statü boş (ekleme yapmıyoruz)
                continue;
            }

            // Bu group execution'dan sonraki task execution'larını al
            // ÖNEMLİ: EndTime'a göre sırala (en son güncellenen execution'ı almak için)
            // EndTime null ise StartTime'a göre sırala
            var taskExecutions = await dbContext.TaskExecutionHistories
                .Where(e => e.GroupExecutionId == latestGroupExecution.Id && e.StartTime >= latestGroupExecution.StartTime)
                .OrderByDescending(e => e.EndTime ?? e.StartTime)
                .ThenByDescending(e => e.StartTime)
                .ToListAsync();

            // Her task için en son execution'ın statüsünü al
            var taskExecutionsByTaskId = taskExecutions
                .GroupBy(e => e.TaskItemId)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var kvp in taskExecutionsByTaskId)
            {
                var key = $"{group.Id}-{kvp.Key}";
                result[key] = kvp.Value.FinalStatus;
            }
        }

        return result;
    }

    public async Task<Dictionary<string, (TaskItemStatus Status, string? ErrorMessage)>> GetTodayTaskStatusesWithErrorsByGroupAsync()
    {
        var dbContext = GetDbContext();
        var result = new Dictionary<string, (TaskItemStatus Status, string? ErrorMessage)>();
        
        if (_dataService == null)
        {
            return result;
        }

        // Tüm grupları al
        var data = await _dataService.GetDataAsync();
        var groups = data.Groups;
        var todayStart = DateTime.Now.Date;
        var todayEnd = todayStart.AddDays(1);

        if (dbContext == null)
        {
            // JSON modunda - aktif execution'lardan bugün başlamış olanları al
            foreach (var group in groups)
            {
                var latestGroupExecution = _activeGroupExecutions.Values
                    .Where(e => e.GroupId == group.Id && e.StartTime.Date == todayStart)
                    .OrderByDescending(e => e.StartTime)
                    .FirstOrDefault();

                if (latestGroupExecution == null)
                {
                    continue;
                }

                var taskExecutions = _activeTaskExecutions.Values
                    .Where(e => e.GroupExecutionId == latestGroupExecution.Id && e.StartTime >= latestGroupExecution.StartTime)
                    .OrderByDescending(e => e.StartTime)
                    .ToList();

                var taskExecutionsByTaskId = taskExecutions
                    .GroupBy(e => e.TaskItemId)
                    .ToDictionary(g => g.Key, g => g.First());

                foreach (var kvp in taskExecutionsByTaskId)
                {
                    var key = $"{group.Id}-{kvp.Key}";
                    result[key] = (kvp.Value.FinalStatus, kvp.Value.ErrorMessage);
                }
            }
            return result;
        }

        // Veritabanı modunda
        foreach (var group in groups)
        {
            var latestGroupExecution = await dbContext.GroupExecutionHistories
                .Where(e => e.GroupId == group.Id && e.StartTime >= todayStart && e.StartTime < todayEnd)
                .OrderByDescending(e => e.StartTime)
                .FirstOrDefaultAsync();

            if (latestGroupExecution == null)
            {
                continue;
            }

            var taskExecutions = await dbContext.TaskExecutionHistories
                .Where(e => e.GroupExecutionId == latestGroupExecution.Id && e.StartTime >= latestGroupExecution.StartTime)
                .OrderByDescending(e => e.StartTime)
                .ToListAsync();

            var taskExecutionsByTaskId = taskExecutions
                .GroupBy(e => e.TaskItemId)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var kvp in taskExecutionsByTaskId)
            {
                var key = $"{group.Id}-{kvp.Key}";
                result[key] = (kvp.Value.FinalStatus, kvp.Value.ErrorMessage);
            }
        }

        return result;
    }
}

