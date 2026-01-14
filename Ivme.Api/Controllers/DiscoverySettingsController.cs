using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Ivme.Api.Data;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class DiscoverySettingsController : ControllerBase
{
    private readonly TaskDbContext _dbContext;
    private readonly IStoredProcedureDiscoveryService _discoveryService;

    public DiscoverySettingsController(TaskDbContext dbContext, IStoredProcedureDiscoveryService discoveryService)
    {
        _dbContext = dbContext;
        _discoveryService = discoveryService;
    }

    [HttpGet("databases")]
    public async Task<ActionResult<List<string>>> GetAllDatabases()
    {
        var databases = await _discoveryService.GetAllDatabasesAsync();
        return Ok(databases);
    }

    [HttpGet("selected")]
    public async Task<ActionResult<List<DiscoveryDatabase>>> GetSelectedDatabases()
    {
        var selected = await _dbContext.DiscoveryDatabases.ToListAsync();
        return Ok(selected);
    }

    [HttpPost("selected")]
    public async Task<IActionResult> SaveSelectedDatabases([FromBody] List<string> databaseNames)
    {
        // Mevcutları temizle (basit yaklaşım)
        var existing = await _dbContext.DiscoveryDatabases.ToListAsync();
        _dbContext.DiscoveryDatabases.RemoveRange(existing);

        foreach (var dbName in databaseNames)
        {
            _dbContext.DiscoveryDatabases.Add(new DiscoveryDatabase
            {
                DatabaseName = dbName,
                IsSelected = true
            });
        }

        await _dbContext.SaveChangesAsync();
        return Ok(new { message = "Seçilen veritabanları kaydedildi." });
    }

    [HttpPost("sync")]
    public async Task<IActionResult> SyncProcedures()
    {
        try
        {
            await _discoveryService.SyncStoredProceduresToTaskItemsAsync();
            return Ok(new { message = "Senkronizasyon başarıyla tamamlandı." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Senkronizasyon hatası: {ex.Message}" });
        }
    }
}
