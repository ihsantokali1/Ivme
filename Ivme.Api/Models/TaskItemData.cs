namespace Ivme.Api.Models;

public class TaskItemData
{
    public List<TaskItemGroup> Groups { get; set; } = new();
    public List<TaskItem> TaskItems { get; set; } = new();
    public List<GroupTaskAssignment> GroupTaskAssignments { get; set; } = new();
    public List<GroupSchedule> GroupSchedules { get; set; } = new();
    public List<FlowItem> FlowItems { get; set; } = new();
    public List<FlowGroupAssignment> FlowGroupAssignments { get; set; } = new();
    public List<FlowSchedule> FlowSchedules { get; set; } = new();
}

