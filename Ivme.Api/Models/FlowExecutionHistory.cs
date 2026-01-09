using System;

namespace Ivme.Api.Models;

public class FlowExecutionHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FlowItemId { get; set; } = string.Empty;
    public DateTime StartTime { get; set; } = DateTime.Now;
    public DateTime? EndTime { get; set; }
    public string Status { get; set; } = "Running"; // Running, Completed, Failed
    public int ErrorCount { get; set; } = 0;
    public string? TriggeredBy { get; set; } // Manual, Schedule, System
    
    // UI'da göstermek için (Join ile veya ayrı sorgu ile doldurulabilir)
    // public string FlowName { get; set; } 
}
