namespace Ivme.Api.Models;

public enum TaskItemStatus
{
    Pending,         // Beklemede
    Ready,           // Başlamaya hazır (önşartlar tamamlandı)
    Running,         // Çalışıyor
    Paused,          // Duraklatıldı
    Completed,       // Tamamlandı
    MarkedAsSuccess, // Başarılı sayıldı (manuel olarak işaretlendi)
    Failed,          // Başarısız
    WaitingRetry     // Yeniden deneme bekliyor
}

