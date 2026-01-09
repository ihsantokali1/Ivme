namespace Ivme.Api.Models;

public class FlowGroupAssignment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FlowItemId { get; set; } = string.Empty;
    public string GroupId { get; set; } = string.Empty;
    public int Order { get; set; } = 0; // Grubun akıştaki sırası
    public List<string> PrerequisiteGroupIds { get; set; } = new(); // Bu grubun önşartları (aynı akış içinde)
    
    // Akış bazlı durum bilgileri
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Pending;
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }  
    public DateTime? LastErrorTime { get; set; }
    public int Progress { get; set; } = 0;
    public string? ErrorMessage { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
