using System.Text.Json;
using Ivme.Api.Models;
using Ivme.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Ivme.Api.Services;

public class TaskDataService : ITaskDataService
{
    private readonly string _dataFilePath;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly DatabaseConfig _dbConfig;
    private readonly TaskDbContext? _dbContext;

    public TaskDataService(DatabaseConfig dbConfig, TaskDbContext? dbContext = null)
    {
        _dbConfig = dbConfig;
        _dbContext = dbContext; // Null olabilir (JSON modunda)
        
        var dataDirectory = Path.Combine(Directory.GetCurrentDirectory(), "Data");
        if (!Directory.Exists(dataDirectory))
        {
            Directory.CreateDirectory(dataDirectory);
        }
        
        _dataFilePath = Path.Combine(dataDirectory, "tasks.json");
        _jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
    }

    private TaskDbContext? GetDbContext()
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
            return null;
        return _dbContext;
    }

    public async Task<TaskItemData> GetDataAsync()
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            // Veritabanı modu - TaskItem'ları Parameters ile birlikte yükle
            // Include kullanırken, verileri memory'ye almalıyız (ToListAsync() ile)
            // Böylece DbContext dispose edildikten sonra lazy loading çalışmaya çalışmaz
            var taskItems = await dbContext.TaskItems
                .Include(t => t.Parameters)
                .AsNoTracking() // Tracking'i kapat - performans için ve dispose sorunlarını önlemek için
                .ToListAsync();
            
            // Null değerleri handle et - eski kayıtlar için default değerler
            foreach (var taskItem in taskItems)
            {
                // SourceType null ise Manual yap
                if (!taskItem.SourceType.HasValue || taskItem.SourceType == default(TaskSourceType))
                {
                    taskItem.SourceType = TaskSourceType.Manual;
                }
                
                // IsActive null ise true yap
                if (!taskItem.IsActive.HasValue)
                {
                    taskItem.IsActive = true;
                }
                
                // Parameters null ise boş liste yap
                if (taskItem.Parameters == null)
                {
                    taskItem.Parameters = new List<TaskParameter>();
                }
            }
            
            return new TaskItemData
            {
                Groups = await dbContext.Groups.AsNoTracking().ToListAsync(),
                TaskItems = taskItems,
                GroupTaskAssignments = await dbContext.GroupTaskAssignments.AsNoTracking().ToListAsync(),
                GroupSchedules = await dbContext.GroupSchedules.AsNoTracking().ToListAsync()
            };
        }

        // JSON modu
        if (!File.Exists(_dataFilePath))
        {
            return new TaskItemData();
        }

        var json = await File.ReadAllTextAsync(_dataFilePath);
        if (string.IsNullOrWhiteSpace(json))
        {
            return new TaskItemData();
        }

        try
        {
            return JsonSerializer.Deserialize<TaskItemData>(json, _jsonOptions) ?? new TaskItemData();
        }
        catch
        {
            return new TaskItemData();
        }
    }

    public async Task SaveDataAsync(TaskItemData data)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            // Veritabanı modu - SaveDataAsync genellikle kullanılmaz, ama yine de implement edelim
            // Not: Bu metod genellikle tüm veriyi güncellemek için kullanılıyor, 
            // ama DB'de her entity ayrı ayrı güncelleniyor, bu yüzden burada bir şey yapmıyoruz
            return;
        }

        // JSON modu
        var json = JsonSerializer.Serialize(data, _jsonOptions);
        await File.WriteAllTextAsync(_dataFilePath, json);
    }

    public async Task<TaskItemGroup?> GetGroupAsync(string groupId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        }
        var data = await GetDataAsync();
        return data.Groups.FirstOrDefault(g => g.Id == groupId);
    }

    public async Task<TaskItem?> GetTaskItemAsync(string taskItemId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.TaskItems.FirstOrDefaultAsync(t => t.Id == taskItemId);
        }
        var data = await GetDataAsync();
        return data.TaskItems.FirstOrDefault(t => t.Id == taskItemId);
    }

    public async Task<TaskItemGroup> CreateGroupAsync(TaskItemGroup group)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            // Veritabanı modu
            group.CreatedAt = DateTime.UtcNow;
            group.UpdatedAt = DateTime.UtcNow;
            dbContext.Groups.Add(group);
            await dbContext.SaveChangesAsync();
            return group;
        }

        // JSON modu
        var data = await GetDataAsync();
        group.CreatedAt = DateTime.UtcNow;
        group.UpdatedAt = DateTime.UtcNow;
        data.Groups.Add(group);
        await SaveDataAsync(data);
        return group;
    }

    public async Task<TaskItem> CreateTaskItemAsync(TaskItem taskItem)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            // Veritabanı modu
            taskItem.CreatedAt = DateTime.UtcNow;
            taskItem.UpdatedAt = DateTime.UtcNow;
            dbContext.TaskItems.Add(taskItem);
            await dbContext.SaveChangesAsync();
            return taskItem;
        }

        // JSON modu
        var data = await GetDataAsync();
        taskItem.CreatedAt = DateTime.UtcNow;
        taskItem.UpdatedAt = DateTime.UtcNow;
        data.TaskItems.Add(taskItem);
        await SaveDataAsync(data);
        return taskItem;
    }

    public async Task<TaskItemGroup> UpdateGroupAsync(TaskItemGroup group)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            // Veritabanı modu
            var existing = await dbContext.Groups.FirstOrDefaultAsync(g => g.Id == group.Id);
            if (existing == null)
            {
                throw new KeyNotFoundException($"Group with id {group.Id} not found");
            }

            existing.Name = group.Name;
            existing.Description = group.Description;
            existing.UpdatedAt = DateTime.UtcNow;
            await dbContext.SaveChangesAsync();
            return existing;
        }

        // JSON modu
        var data = await GetDataAsync();
        var existingJson = data.Groups.FirstOrDefault(g => g.Id == group.Id);
        if (existingJson == null)
        {
            throw new KeyNotFoundException($"Group with id {group.Id} not found");
        }

        existingJson.Name = group.Name;
        existingJson.Description = group.Description;
        existingJson.UpdatedAt = DateTime.UtcNow;

        await SaveDataAsync(data);
        return existingJson;
    }

    public async Task<TaskItem> UpdateTaskItemAsync(TaskItem taskItem)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            // Veritabanı modu
            var existing = await dbContext.TaskItems.FirstOrDefaultAsync(t => t.Id == taskItem.Id);
            if (existing == null)
            {
                throw new KeyNotFoundException($"TaskItem with id {taskItem.Id} not found");
            }

            existing.Name = taskItem.Name;
            existing.Description = taskItem.Description;
            existing.RetryIntervalMinutes = taskItem.RetryIntervalMinutes;
            existing.StartTime = taskItem.StartTime;
            existing.EndTime = taskItem.EndTime;
            existing.LastErrorTime = taskItem.LastErrorTime;
            existing.RetryDelayMinutes = taskItem.RetryDelayMinutes;
            existing.Progress = taskItem.Progress;
            existing.ErrorMessage = taskItem.ErrorMessage;
            existing.UpdatedAt = DateTime.UtcNow;
            await dbContext.SaveChangesAsync();
            return existing;
        }

        // JSON modu
        var data = await GetDataAsync();
        var existingJson = data.TaskItems.FirstOrDefault(t => t.Id == taskItem.Id);
        if (existingJson == null)
        {
            throw new KeyNotFoundException($"TaskItem with id {taskItem.Id} not found");
        }

        existingJson.Name = taskItem.Name;
        existingJson.Description = taskItem.Description;
        existingJson.RetryIntervalMinutes = taskItem.RetryIntervalMinutes;
        existingJson.StartTime = taskItem.StartTime;
        existingJson.EndTime = taskItem.EndTime;
        existingJson.LastErrorTime = taskItem.LastErrorTime;
        existingJson.RetryDelayMinutes = taskItem.RetryDelayMinutes;
        existingJson.Progress = taskItem.Progress;
        existingJson.ErrorMessage = taskItem.ErrorMessage;
        existingJson.UpdatedAt = DateTime.UtcNow;

        await SaveDataAsync(data);
        return existingJson;
    }

    public async Task<bool> DeleteGroupAsync(string groupId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            var group = await dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
            if (group == null) return false;
            
            dbContext.GroupTaskAssignments.RemoveRange(
                await dbContext.GroupTaskAssignments.Where(a => a.GroupId == groupId).ToListAsync());
            dbContext.GroupSchedules.RemoveRange(
                await dbContext.GroupSchedules.Where(s => s.GroupId == groupId).ToListAsync());
            dbContext.Groups.Remove(group);
            await dbContext.SaveChangesAsync();
            return true;
        }

        var data = await GetDataAsync();
        var groupJson = data.Groups.FirstOrDefault(g => g.Id == groupId);
        if (groupJson == null) return false;

        data.GroupTaskAssignments.RemoveAll(a => a.GroupId == groupId);
        data.GroupSchedules.RemoveAll(s => s.GroupId == groupId);
        data.Groups.Remove(groupJson);
        await SaveDataAsync(data);
        return true;
    }

    public async Task<bool> DeleteTaskItemAsync(string taskItemId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            var taskItem = await dbContext.TaskItems.FirstOrDefaultAsync(t => t.Id == taskItemId);
            if (taskItem == null) return false;
            
            // Assignment'ları sil
            dbContext.GroupTaskAssignments.RemoveRange(
                await dbContext.GroupTaskAssignments.Where(a => a.TaskItemId == taskItemId).ToListAsync());
            
            // Diğer assignment'lardaki önşart referanslarını temizle
            var assignments = await dbContext.GroupTaskAssignments.ToListAsync();
            foreach (var assignment in assignments)
            {
                if (assignment.PrerequisiteTaskItemIds != null && assignment.PrerequisiteTaskItemIds.Contains(taskItemId))
                {
                    assignment.PrerequisiteTaskItemIds.Remove(taskItemId);
                }
            }
            
            dbContext.TaskItems.Remove(taskItem);
            await dbContext.SaveChangesAsync();
            return true;
        }

        var data = await GetDataAsync();
        var taskItemJson = data.TaskItems.FirstOrDefault(t => t.Id == taskItemId);
        if (taskItemJson == null) return false;

        data.GroupTaskAssignments.RemoveAll(a => a.TaskItemId == taskItemId);
        foreach (var assignment in data.GroupTaskAssignments)
        {
            assignment.PrerequisiteTaskItemIds.Remove(taskItemId);
        }
        data.TaskItems.Remove(taskItemJson);
        await SaveDataAsync(data);
        return true;
    }

    public async Task<GroupTaskAssignment> CreateGroupTaskAssignmentAsync(GroupTaskAssignment assignment)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            assignment.CreatedAt = DateTime.UtcNow;
            assignment.UpdatedAt = DateTime.UtcNow;
            dbContext.GroupTaskAssignments.Add(assignment);
            await dbContext.SaveChangesAsync();
            return assignment;
        }

        var data = await GetDataAsync();
        assignment.CreatedAt = DateTime.UtcNow;
        assignment.UpdatedAt = DateTime.UtcNow;
        data.GroupTaskAssignments.Add(assignment);
        await SaveDataAsync(data);
        return assignment;
    }

    public async Task<GroupTaskAssignment> UpdateGroupTaskAssignmentAsync(GroupTaskAssignment assignment)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            var existing = await dbContext.GroupTaskAssignments.FirstOrDefaultAsync(a => a.Id == assignment.Id);
            if (existing == null)
                throw new KeyNotFoundException($"GroupTaskAssignment with id {assignment.Id} not found");

            existing.GroupId = assignment.GroupId;
            existing.TaskItemId = assignment.TaskItemId;
            existing.Order = assignment.Order;
            existing.PrerequisiteTaskItemIds = assignment.PrerequisiteTaskItemIds;
            existing.Status = assignment.Status;
            existing.StartTime = assignment.StartTime;
            existing.EndTime = assignment.EndTime;
            existing.LastErrorTime = assignment.LastErrorTime;
            existing.Progress = assignment.Progress;
            existing.ErrorMessage = assignment.ErrorMessage;
            existing.TaskParameterValues = assignment.TaskParameterValues ?? new Dictionary<string, string?>();
            existing.UpdatedAt = DateTime.UtcNow;
            await dbContext.SaveChangesAsync();
            return existing;
        }

        var data = await GetDataAsync();
        var existingJson = data.GroupTaskAssignments.FirstOrDefault(a => a.Id == assignment.Id);
        if (existingJson == null)
            throw new KeyNotFoundException($"GroupTaskAssignment with id {assignment.Id} not found");

        existingJson.GroupId = assignment.GroupId;
        existingJson.TaskItemId = assignment.TaskItemId;
        existingJson.Order = assignment.Order;
        existingJson.PrerequisiteTaskItemIds = assignment.PrerequisiteTaskItemIds;
        existingJson.Status = assignment.Status;
        existingJson.StartTime = assignment.StartTime;
        existingJson.EndTime = assignment.EndTime;
        existingJson.LastErrorTime = assignment.LastErrorTime;
        existingJson.Progress = assignment.Progress;
        existingJson.ErrorMessage = assignment.ErrorMessage;
        existingJson.TaskParameterValues = assignment.TaskParameterValues ?? new Dictionary<string, string?>();
        existingJson.UpdatedAt = DateTime.UtcNow;
        await SaveDataAsync(data);
        return existingJson;
    }

    public async Task<bool> DeleteGroupTaskAssignmentAsync(string assignmentId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            var assignment = await dbContext.GroupTaskAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId);
            if (assignment == null) return false;
            
            var taskItemId = assignment.TaskItemId;
            
            // Diğer assignment'lardaki önşart referanslarını temizle
            var allAssignments = await dbContext.GroupTaskAssignments.ToListAsync();
            foreach (var otherAssignment in allAssignments)
            {
                if (otherAssignment.PrerequisiteTaskItemIds != null && 
                    otherAssignment.PrerequisiteTaskItemIds.Contains(taskItemId) &&
                    otherAssignment.GroupId == assignment.GroupId) // Aynı grup içindeki önşartları temizle
                {
                    otherAssignment.PrerequisiteTaskItemIds.Remove(taskItemId);
                }
            }
            
            dbContext.GroupTaskAssignments.Remove(assignment);
            await dbContext.SaveChangesAsync();
            return true;
        }

        var data = await GetDataAsync();
        var assignmentJson = data.GroupTaskAssignments.FirstOrDefault(a => a.Id == assignmentId);
        if (assignmentJson == null) return false;
        
        var taskItemIdJson = assignmentJson.TaskItemId;
        
        // Diğer assignment'lardaki önşart referanslarını temizle
        foreach (var otherAssignment in data.GroupTaskAssignments)
        {
            if (otherAssignment.PrerequisiteTaskItemIds != null && 
                otherAssignment.PrerequisiteTaskItemIds.Contains(taskItemIdJson) &&
                otherAssignment.GroupId == assignmentJson.GroupId) // Aynı grup içindeki önşartları temizle
            {
                otherAssignment.PrerequisiteTaskItemIds.Remove(taskItemIdJson);
            }
        }
        
        data.GroupTaskAssignments.Remove(assignmentJson);
        await SaveDataAsync(data);
        return true;
    }

    /// <summary>
    /// Task'ların bağımlılık seviyesini hesaplar (aynı grup içinde)
    /// Seviye 0: Önşartı olmayan task'lar
    /// Seviye 1: Seviye 0'daki task'ları önşart olarak kullanan task'lar
    /// Seviye 2: Seviye 1'deki task'ları önşart olarak kullanan task'lar
    /// vb.
    /// </summary>
    private Dictionary<string, int> CalculateTaskLevels(List<GroupTaskAssignment> assignments)
    {
        var levels = new Dictionary<string, int>();
        var groupTaskIds = new HashSet<string>(assignments.Select(a => a.TaskItemId));

        // Önce tüm task'lara seviye 0 ver
        foreach (var assignment in assignments)
        {
            levels[assignment.TaskItemId] = 0;
        }

        // Seviye hesaplama (BFS benzeri)
        // Sonsuz döngüyü önlemek için maksimum iterasyon sayısı
        int maxIterations = assignments.Count;
        int iteration = 0;
        bool changed = true;

        while (changed && iteration < maxIterations)
        {
            iteration++;
            changed = false;

            foreach (var assignment in assignments)
            {
                var taskId = assignment.TaskItemId;
                if (!groupTaskIds.Contains(taskId)) continue;

                var currentLevel = levels[taskId];
                int maxPrerequisiteLevel = -1;

                // Tüm önşartların seviyesini kontrol et
                foreach (var prereqId in assignment.PrerequisiteTaskItemIds)
                {
                    if (groupTaskIds.Contains(prereqId))
                    {
                        var prereqLevel = levels.ContainsKey(prereqId) ? levels[prereqId] : 0;
                        maxPrerequisiteLevel = Math.Max(maxPrerequisiteLevel, prereqLevel);
                    }
                }

                // Eğer önşart varsa, seviye = max(önşart seviyeleri) + 1
                if (maxPrerequisiteLevel >= 0)
                {
                    var newLevel = maxPrerequisiteLevel + 1;
                    if (newLevel > currentLevel)
                    {
                        levels[taskId] = newLevel;
                        changed = true;
                    }
                }
            }
        }

        return levels;
    }

    public async Task<List<GroupTaskAssignment>> GetGroupTaskAssignmentsAsync(string groupId)
    {
        var dbContext = GetDbContext();
        List<GroupTaskAssignment> assignments;
        
        if (dbContext != null)
        {
            assignments = await dbContext.GroupTaskAssignments
                .Where(a => a.GroupId == groupId)
                .ToListAsync();
        }
        else
        {
            var data = await GetDataAsync();
            assignments = data.GroupTaskAssignments
                .Where(a => a.GroupId == groupId)
                .ToList();
        }

        // Seviye hesaplaması yap
        var taskLevels = CalculateTaskLevels(assignments);

        // Sıralama: Önce seviyeye göre, sonra aynı seviyedeki işlerde önşart sayısına göre ters sıralama (daha fazla önşartı olan önce), sonra Order'a göre
        return assignments.OrderBy(a =>
        {
            var level = taskLevels.ContainsKey(a.TaskItemId) ? taskLevels[a.TaskItemId] : 0;
            var prerequisiteCount = a.PrerequisiteTaskItemIds?.Count ?? 0;
            // Önşart sayısına göre ters sıralama (daha fazla önşartı olan önce) - negatif değer kullanarak ters sıralama yapıyoruz
            var prerequisitePriority = -prerequisiteCount;
            return (level, prerequisitePriority, a.Order);
        }).ToList();
    }

    public async Task<GroupTaskAssignment?> GetGroupTaskAssignmentAsync(string assignmentId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.GroupTaskAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId);
        }

        var data = await GetDataAsync();
        return data.GroupTaskAssignments.FirstOrDefault(a => a.Id == assignmentId);
    }

    public async Task<GroupSchedule> CreateOrUpdateGroupScheduleAsync(GroupSchedule schedule)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            var existing = await dbContext.GroupSchedules.FirstOrDefaultAsync(s => s.GroupId == schedule.GroupId);
            if (existing == null)
            {
                // Yeni schedule ekle
                // Id boşsa veya null ise yeni bir Guid oluştur
                if (string.IsNullOrEmpty(schedule.Id))
                {
                    schedule.Id = Guid.NewGuid().ToString();
                }
                
                if (schedule.CreatedAt == default(DateTime))
                {
                    schedule.CreatedAt = DateTime.UtcNow;
                }
                if (schedule.UpdatedAt == default(DateTime))
                {
                    schedule.UpdatedAt = DateTime.UtcNow;
                }
                
                dbContext.GroupSchedules.Add(schedule);
            }
            else
            {
                // Mevcut schedule'ı güncelle
                existing.WorkPeriod = schedule.WorkPeriod;
                existing.StartTime = schedule.StartTime;
                existing.RestartOnError = schedule.RestartOnError;
                existing.IsActive = schedule.IsActive;
                if (schedule.LastRunTime.HasValue)
                    existing.LastRunTime = schedule.LastRunTime;
                existing.UpdatedAt = DateTime.UtcNow;
                schedule = existing;
            }
            await dbContext.SaveChangesAsync();
            return schedule;
        }

        var data = await GetDataAsync();
        var existingJson = data.GroupSchedules.FirstOrDefault(s => s.GroupId == schedule.GroupId);
        if (existingJson == null)
        {
            // Yeni schedule ekle
            // Id boşsa veya null ise yeni bir Guid oluştur
            if (string.IsNullOrEmpty(schedule.Id))
            {
                schedule.Id = Guid.NewGuid().ToString();
            }
            
            if (schedule.CreatedAt == default(DateTime))
            {
                schedule.CreatedAt = DateTime.UtcNow;
            }
            if (schedule.UpdatedAt == default(DateTime))
            {
                schedule.UpdatedAt = DateTime.UtcNow;
            }
            
            data.GroupSchedules.Add(schedule);
        }
        else
        {
            existingJson.WorkPeriod = schedule.WorkPeriod;
            existingJson.StartTime = schedule.StartTime;
            existingJson.RestartOnError = schedule.RestartOnError;
            existingJson.IsActive = schedule.IsActive;
            if (schedule.LastRunTime.HasValue)
                existingJson.LastRunTime = schedule.LastRunTime;
            existingJson.UpdatedAt = DateTime.UtcNow;
            schedule = existingJson;
        }
        await SaveDataAsync(data);
        return schedule;
    }

    public async Task<GroupSchedule?> GetGroupScheduleAsync(string groupId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.GroupSchedules.FirstOrDefaultAsync(s => s.GroupId == groupId);
        }

        var data = await GetDataAsync();
        return data.GroupSchedules.FirstOrDefault(s => s.GroupId == groupId);
    }

    public async Task<bool> DeleteGroupScheduleAsync(string scheduleId)
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            var schedule = await dbContext.GroupSchedules.FirstOrDefaultAsync(s => s.Id == scheduleId);
            if (schedule == null) return false;
            dbContext.GroupSchedules.Remove(schedule);
            await dbContext.SaveChangesAsync();
            return true;
        }

        var data = await GetDataAsync();
        var scheduleJson = data.GroupSchedules.FirstOrDefault(s => s.Id == scheduleId);
        if (scheduleJson == null) return false;
        data.GroupSchedules.Remove(scheduleJson);
        await SaveDataAsync(data);
        return true;
    }

    public async Task<List<GroupSchedule>> GetActiveGroupSchedulesAsync()
    {
        var dbContext = GetDbContext();
        if (dbContext != null)
        {
            return await dbContext.GroupSchedules
                .Where(s => s.IsActive)
                .ToListAsync();
        }

        var data = await GetDataAsync();
        return data.GroupSchedules
            .Where(s => s.IsActive)
            .ToList();
    }
}

