namespace Ivme.Api.Models;

public class GroupSchedule
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string GroupId { get; set; } = string.Empty;
    public WorkPeriod WorkPeriod { get; set; } = WorkPeriod.Daily;
    public TimeSpan StartTime { get; set; } = TimeSpan.Zero; // Günlük başlangıç saati (örn: 09:00)
    public bool RestartOnError { get; set; } = false; // Hata durumunda baştan mı (true) yoksa kaldığı yerden mi (false) devam edecek
    public bool IsActive { get; set; } = true;
    public DateTime? LastRunTime { get; set; } // Son çalıştırma zamanı
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

