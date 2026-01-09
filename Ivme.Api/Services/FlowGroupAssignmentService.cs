using Ivme.Api.Data;
using Ivme.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Ivme.Api.Services;

public class FlowGroupAssignmentService : IFlowGroupAssignmentService
{
    private readonly TaskDbContext _dbContext;

    public FlowGroupAssignmentService(TaskDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<FlowGroupAssignment>> GetAssignmentsByFlowAsync(string flowItemId)
    {
        return await _dbContext.FlowGroupAssignments
            .Where(a => a.FlowItemId == flowItemId)
            .OrderBy(a => a.Order)
            .AsNoTracking()
            .ToListAsync();
    }

    public async Task<FlowGroupAssignment?> GetAssignmentByIdAsync(string id)
    {
        return await _dbContext.FlowGroupAssignments
            .FirstOrDefaultAsync(a => a.Id == id);
    }

    public async Task<FlowGroupAssignment> CreateAssignmentAsync(FlowGroupAssignment assignment)
    {
        if (string.IsNullOrEmpty(assignment.Id))
            assignment.Id = Guid.NewGuid().ToString();
            
        assignment.CreatedAt = DateTime.UtcNow;
        assignment.UpdatedAt = DateTime.UtcNow;
        
        _dbContext.FlowGroupAssignments.Add(assignment);
        await _dbContext.SaveChangesAsync();
        return assignment;
    }

    public async Task<FlowGroupAssignment> UpdateAssignmentAsync(FlowGroupAssignment assignment)
    {
        var existing = await _dbContext.FlowGroupAssignments.FirstOrDefaultAsync(a => a.Id == assignment.Id);
        if (existing == null) throw new KeyNotFoundException("Assignment not found");
        
        existing.Order = assignment.Order;
        existing.PrerequisiteGroupIds = assignment.PrerequisiteGroupIds;
        existing.UpdatedAt = DateTime.UtcNow;
        
        await _dbContext.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAssignmentAsync(string id)
    {
        var assignment = await _dbContext.FlowGroupAssignments.FindAsync(id);
        if (assignment == null) return false;
        
        _dbContext.FlowGroupAssignments.Remove(assignment);
        await _dbContext.SaveChangesAsync();
        return true;
    }
}
