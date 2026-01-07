using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Ivme.Api.Models;
using Ivme.Api.Services;

namespace Ivme.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GroupTaskAssignmentsController : ControllerBase
{
    private readonly ITaskDataService _dataService;

    public GroupTaskAssignmentsController(ITaskDataService dataService)
    {
        _dataService = dataService;
    }

    [HttpGet]
    public async Task<ActionResult<List<GroupTaskAssignment>>> GetAllGroupTaskAssignments()
    {
        var data = await _dataService.GetDataAsync();
        return Ok(data.GroupTaskAssignments);
    }

    [HttpGet("group/{groupId}")]
    public async Task<ActionResult<List<GroupTaskAssignment>>> GetGroupTaskAssignments(string groupId)
    {
        var assignments = await _dataService.GetGroupTaskAssignmentsAsync(groupId);
        return Ok(assignments);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GroupTaskAssignment>> GetGroupTaskAssignment(string id)
    {
        var assignment = await _dataService.GetGroupTaskAssignmentAsync(id);
        if (assignment == null)
        {
            return NotFound();
        }
        return Ok(assignment);
    }

    [HttpPost]
    public async Task<ActionResult<GroupTaskAssignment>> CreateGroupTaskAssignment([FromBody] GroupTaskAssignment assignment)
    {
        var created = await _dataService.CreateGroupTaskAssignmentAsync(assignment);
        return CreatedAtAction(nameof(GetGroupTaskAssignment), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<GroupTaskAssignment>> UpdateGroupTaskAssignment(string id, [FromBody] GroupTaskAssignment assignment)
    {
        if (id != assignment.Id)
        {
            return BadRequest("ID mismatch");
        }

        try
        {
            var updated = await _dataService.UpdateGroupTaskAssignmentAsync(assignment);
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteGroupTaskAssignment(string id)
    {
        var deleted = await _dataService.DeleteGroupTaskAssignmentAsync(id);
        if (!deleted)
        {
            return NotFound();
        }
        return NoContent();
    }
}

