namespace Ivme.Api.Models;

/// <summary>
/// Task çalışma geçmişi - Her task çalışması için bir kayıt
/// </summary>
public class TaskExecutionHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TaskItemId { get; set; } = string.Empty;
    public string? GroupId { get; set; } // Hangi grup içinde çalıştığı (geriye uyumluluk için)
    public string? GroupExecutionId { get; set; } // Hangi grup execution'ı içinde çalıştığı
    public string? FlowItemId { get; set; } // Hangi akış içinde çalıştığı
    public string? FlowItemExecutionId { get; set; } // Hangi akış execution'ı içinde çalıştığı
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public TimeSpan? Duration => EndTime.HasValue ? EndTime.Value - StartTime : null;
    public TaskItemStatus FinalStatus { get; set; } // Completed, Failed, vb.
    public int ErrorCount { get; set; } = 0; // Bu çalışma sırasında kaç kere hata aldı
    public string? ErrorMessage { get; set; } // Son hata mesajı
    public DateTime? LastErrorTime { get; set; } // Son hata zamanı
    public DateTime? RetryStartTime { get; set; } // Hata sonrası ne zaman tekrar başladı
    public int RetryCount { get; set; } = 0; // Bu task için kaçıncı retry olduğu (0 = ilk çalışma, 1 = 1. retry, 2 = 2. retry, vb.)
    public int Progress { get; set; } = 0; // Son progress değeri
    public Dictionary<string, string?> TaskParameterValues { get; set; } = new(); // Task çalıştırılırken kullanılan parametre değerleri
    public string? TriggeredBy { get; set; } // System, UserId, vb.
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

