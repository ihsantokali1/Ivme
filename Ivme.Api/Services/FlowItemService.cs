using Ivme.Api.Data;
using Ivme.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Ivme.Api.Services;

public class FlowItemService : IFlowItemService
{
    private readonly TaskDbContext _dbContext;

    public FlowItemService(TaskDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<FlowItem>> GetAllFlowsAsync()
    {
        return await _dbContext.FlowItems
            .OrderBy(f => f.Name)
            .AsNoTracking()
            .ToListAsync();
    }

    public async Task<FlowItem?> GetFlowByIdAsync(string id)
    {
        return await _dbContext.FlowItems
            .FirstOrDefaultAsync(f => f.Id == id);
    }

    public async Task<FlowItem> CreateFlowAsync(FlowItem flow)
    {
        if (string.IsNullOrEmpty(flow.Id))
            flow.Id = Guid.NewGuid().ToString();
            
        flow.CreatedAt = DateTime.UtcNow;
        flow.UpdatedAt = DateTime.UtcNow;
        
        _dbContext.FlowItems.Add(flow);
        await _dbContext.SaveChangesAsync();
        return flow;
    }

    public async Task<FlowItem> UpdateFlowAsync(FlowItem flow)
    {
        var existing = await _dbContext.FlowItems.FirstOrDefaultAsync(f => f.Id == flow.Id);
        if (existing == null) throw new KeyNotFoundException("Flow not found");
        
        existing.Name = flow.Name;
        existing.Description = flow.Description;
        existing.UpdatedAt = DateTime.UtcNow;
        
        await _dbContext.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteFlowAsync(string id)
    {
        var flow = await _dbContext.FlowItems.FindAsync(id);
        if (flow == null) return false;
        
        _dbContext.FlowItems.Remove(flow);
        await _dbContext.SaveChangesAsync();
        return true;
    }
}
