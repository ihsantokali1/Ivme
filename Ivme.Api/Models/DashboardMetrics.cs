using System;
using System.Collections.Generic;

namespace Ivme.Api.Models;

public class DashboardMetrics
{
    public int TotalFlowsToday { get; set; }
    public int SuccessfulFlowsToday { get; set; }
    public double FlowSuccessRate { get; set; }

    public int TotalGroupsToday { get; set; }
    public int SuccessfulGroupsToday { get; set; }
    public double GroupSuccessRate { get; set; }

    public int TotalTasksToday { get; set; }
    public int SuccessfulTasksToday { get; set; }
    public double TaskSuccessRate { get; set; }

    public int ActiveFlows { get; set; }
    public int ActiveGroups { get; set; }
    public int ActiveTasks { get; set; }

    public List<FailedMetricItem> FailedLastAttemptToday { get; set; } = new();
}

public class FailedMetricItem
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Type { get; set; } // Flow, Group, Task
    public string ErrorMessage { get; set; }
    public DateTime LastAttemptTime { get; set; }
    public string? Status { get; set; }
}
