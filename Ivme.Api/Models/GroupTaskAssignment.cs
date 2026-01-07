namespace Ivme.Api.Models;

public class GroupTaskAssignment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string GroupId { get; set; } = string.Empty;
    public string TaskItemId { get; set; } = string.Empty;
    public int Order { get; set; } = 0; // Task'ın gruptaki sırası
    public List<string> PrerequisiteTaskItemIds { get; set; } = new(); // Bu task'ın önşartları (aynı grup içinde)
    
    // Grup bazlı durum bilgileri
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Pending;
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public DateTime? LastErrorTime { get; set; }
    public int Progress { get; set; } = 0;
    public string? ErrorMessage { get; set; }
    
    // Grup bazlı parametre değerleri (SP çalıştırılırken kullanılacak)
    // Key: ParameterName (örn: "@StartDate"), Value: Parametre değeri veya null
    public Dictionary<string, string?> TaskParameterValues { get; set; } = new();
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

