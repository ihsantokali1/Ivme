using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface ITaskDataService
{
    Task<TaskItemData> GetDataAsync();
    Task SaveDataAsync(TaskItemData data);
    Task<TaskItemGroup?> GetGroupAsync(string groupId);
    Task<TaskItem?> GetTaskItemAsync(string taskId);
    Task<TaskItemGroup> CreateGroupAsync(TaskItemGroup group);
    Task<TaskItem> CreateTaskItemAsync(TaskItem taskItem);
    Task<TaskItemGroup> UpdateGroupAsync(TaskItemGroup group);
    Task<TaskItem> UpdateTaskItemAsync(TaskItem taskItem);
    Task<bool> DeleteGroupAsync(string groupId);
    Task<bool> DeleteTaskItemAsync(string taskId);
    
    // GroupTaskAssignment işlemleri
    Task<GroupTaskAssignment> CreateGroupTaskAssignmentAsync(GroupTaskAssignment assignment);
    Task<GroupTaskAssignment> UpdateGroupTaskAssignmentAsync(GroupTaskAssignment assignment);
    Task<bool> DeleteGroupTaskAssignmentAsync(string assignmentId);
    Task<List<GroupTaskAssignment>> GetGroupTaskAssignmentsAsync(string groupId);
    Task<GroupTaskAssignment?> GetGroupTaskAssignmentAsync(string assignmentId);
    
    // GroupSchedule işlemleri
    Task<GroupSchedule> CreateOrUpdateGroupScheduleAsync(GroupSchedule schedule);
    Task<GroupSchedule?> GetGroupScheduleAsync(string groupId);
    Task<bool> DeleteGroupScheduleAsync(string scheduleId);
    Task<List<GroupSchedule>> GetActiveGroupSchedulesAsync();
}

