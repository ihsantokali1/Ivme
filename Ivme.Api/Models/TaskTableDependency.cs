using System;

namespace Ivme.Api.Models;

public class TaskTableDependency
{
    public string Id { get; set; } = string.Empty;
    public string TaskItemId { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public string SchemaName { get; set; } = string.Empty;
    public string ProcedureName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string UsageType { get; set; } = string.Empty; // Select, Insert, Update, Delete
    public DateTime CreatedAt { get; set; }
}
