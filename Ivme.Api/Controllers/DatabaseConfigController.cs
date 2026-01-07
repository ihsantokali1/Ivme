using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class DatabaseConfigController : ControllerBase
{
    private readonly DatabaseConfig _dbConfig;
    private readonly IConfiguration _configuration;

    public DatabaseConfigController(DatabaseConfig dbConfig, IConfiguration configuration)
    {
        _dbConfig = dbConfig;
        _configuration = configuration;
    }

    [HttpGet]
    public ActionResult<DatabaseConfig> GetConfig()
    {
        // Şifreyi gösterme
        return Ok(new DatabaseConfig
        {
            Server = _dbConfig.Server,
            UserId = _dbConfig.UserId,
            Database = _dbConfig.Database,
            UseDatabase = _dbConfig.UseDatabase,
            Password = "" // Şifre güvenlik için gösterilmez
        });
    }

    [HttpPost]
    public ActionResult UpdateConfig([FromBody] DatabaseConfigRequest request)
    {
        // appsettings.json'ı güncelle
        var configPath = Path.Combine(Directory.GetCurrentDirectory(), "appsettings.json");
        var json = System.IO.File.ReadAllText(configPath);
        var config = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(json);
        
        // Yeni config oluştur
        var newConfig = new
        {
            Logging = config.GetProperty("Logging"),
            AllowedHosts = config.GetProperty("AllowedHosts"),
            DatabaseConfig = new
            {
                UseDatabase = request.UseDatabase,
                Server = request.Server,
                UserId = request.UserId,
                Password = request.Password,
                Database = request.Database
            }
        };

        var options = new System.Text.Json.JsonSerializerOptions { WriteIndented = true };
        var newJson = System.Text.Json.JsonSerializer.Serialize(newConfig, options);
        System.IO.File.WriteAllText(configPath, newJson);

        // Mevcut config'i güncelle
        _dbConfig.UseDatabase = request.UseDatabase;
        _dbConfig.Server = request.Server;
        _dbConfig.UserId = request.UserId;
        _dbConfig.Password = request.Password;
        _dbConfig.Database = request.Database;

        return Ok(new { message = "Database configuration updated. Please restart the application for changes to take effect." });
    }
}

public class DatabaseConfigRequest
{
    public bool UseDatabase { get; set; }
    public string Server { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Database { get; set; } = "TaskManagement";
}

