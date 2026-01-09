namespace Ivme.Api.Models;

/// <summary>
/// Grup çalışma geçmişi - Her grup çalışması için bir kayıt
/// </summary>
public class GroupExecutionHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string GroupId { get; set; } = string.Empty;
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public TimeSpan? Duration => EndTime.HasValue ? EndTime.Value - StartTime : null;
    public int TotalTasks { get; set; } = 0; // Toplam task sayısı
    public int CompletedTasks { get; set; } = 0; // Tamamlanan task sayısı
    public int FailedTasks { get; set; } = 0; // Başarısız task sayısı
    public int TotalErrors { get; set; } = 0; // Toplam hata sayısı
    public string? TriggeredBy { get; set; } // Schedule, Manual, vb.
    public string? FlowExecutionId { get; set; } // Hangi akış execution'ına ait olduğu
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

