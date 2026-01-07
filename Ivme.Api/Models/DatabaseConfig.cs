namespace Ivme.Api.Models;

public class DatabaseConfig
{
    public string Server { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Database { get; set; } = "TaskManagement";
    public bool UseDatabase { get; set; } = false; // JSON veya DB seçimi için
}

