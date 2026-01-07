namespace Ivme.Api.Models;

/// <summary>
/// Task'ın (özellikle SP'nin) parametre tanımları
/// Her parametre için tip, zorunluluk bilgisi tutulur
/// </summary>
public class TaskParameter
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TaskItemId { get; set; } = string.Empty; // Hangi task'a ait
    public string ParameterName { get; set; } = string.Empty; // Parametre adı (örn: "@StartDate")
    public string ParameterType { get; set; } = string.Empty; // SQL tipi (örn: "datetime", "int", "nvarchar(50)")
    public int? MaxLength { get; set; } // String tipi için maksimum uzunluk
    public bool IsRequired { get; set; } = false; // Zorunlu mu?
    public bool IsNullable { get; set; } = true; // Nullable mı? (SQL'de NULL değer alabilir mi?)
    public string? DefaultValue { get; set; } // Varsayılan değer (varsa)
    public int Order { get; set; } = 0; // Parametre sırası
    public string? Description { get; set; } // Parametre açıklaması
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

