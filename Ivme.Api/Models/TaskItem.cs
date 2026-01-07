namespace Ivme.Api.Models;

public class TaskItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int RetryIntervalMinutes { get; set; } = 60; // Kaç dakikada bir tekrar çalışması gerektiği
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public DateTime? LastErrorTime { get; set; }
    public int RetryDelayMinutes { get; set; } = 60; // Hata sonrası bekleme süresi (dakika)
    public int Progress { get; set; } = 0; // 0-100 arası ilerleme
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Stored Procedure desteği
    public TaskSourceType? SourceType { get; set; } = TaskSourceType.Manual; // Nullable - eski kayıtlar için
    public string? StoredProcedureName { get; set; } // SP ise SP adı (örn: "dbo.usp_ProcessData")
    public string? StoredProcedureSchema { get; set; } = "dbo"; // SP schema'sı
    public DateTime? LastDiscoveredAt { get; set; } // Son keşif zamanı (SP'ler için)
    public bool? IsActive { get; set; } = true; // SP silinmişse false yapılır (nullable - eski kayıtlar için)
    
    // Navigation property - SP parametreleri
    public List<TaskParameter> Parameters { get; set; } = new();
}

