using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TaskParametersController : ControllerBase
{
    private readonly TaskDbContext? _dbContext;
    private readonly DatabaseConfig _dbConfig;

    public TaskParametersController(TaskDbContext? dbContext, DatabaseConfig dbConfig)
    {
        _dbContext = dbContext;
        _dbConfig = dbConfig;
    }

    private TaskDbContext? GetDbContext()
    {
        if (!_dbConfig.UseDatabase || _dbContext == null)
            return null;
        return _dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<TaskParameter>>> GetTaskParameters([FromQuery] string? taskItemId)
    {
        var dbContext = GetDbContext();
        if (dbContext == null)
        {
            Console.WriteLine($"[TaskParameters] JSON mode - returning empty list for taskItemId: {taskItemId}");
            return Ok(new List<TaskParameter>());
        }

        var query = dbContext.TaskParameters.AsQueryable();
        
        if (!string.IsNullOrEmpty(taskItemId))
        {
            query = query.Where(p => p.TaskItemId == taskItemId);
            Console.WriteLine($"[TaskParameters] Querying parameters for taskItemId: {taskItemId}");
        }

        var parameters = await query.OrderBy(p => p.Order).ToListAsync();
        Console.WriteLine($"[TaskParameters] Found {parameters.Count} parameters for taskItemId: {taskItemId}");
        
        if (parameters.Count > 0)
        {
            foreach (var param in parameters)
            {
                Console.WriteLine($"[TaskParameters] - {param.ParameterName} ({param.ParameterType}), Required: {param.IsRequired}");
            }
        }
        
        return Ok(parameters);
    }
}

