using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IStoredProcedureDiscoveryService
{
    /// <summary>
    /// SQL Server'dan stored procedure'leri keşfeder
    /// </summary>
    Task<List<StoredProcedureInfo>> DiscoverStoredProceduresAsync(List<string>? targetDatabases = null);
    
    /// <summary>
    /// SQL Server'daki tüm veritabanlarını listeler
    /// </summary>
    Task<List<string>> GetAllDatabasesAsync();
    
    /// <summary>
    /// SP'leri TaskItem'lara senkronize eder
    /// </summary>
    Task SyncStoredProceduresToTaskItemsAsync();
    
    /// <summary>
    /// Belirli bir SP'nin parametrelerini getirir
    /// </summary>
    Task<List<StoredProcedureParameterInfo>> GetStoredProcedureParametersAsync(string database, string schema, string procedureName);
}

public class StoredProcedureInfo
{
    public string Name { get; set; } = string.Empty;
    public string Schema { get; set; } = "dbo";
    public string Database { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
    public DateTime ModifiedDate { get; set; }
    public List<StoredProcedureParameterInfo> Parameters { get; set; } = new();
    public string TableUsageSummary { get; set; } = string.Empty;
    public List<StoredProcedureTableDependency> TableDependencies { get; set; } = new();
}

public class StoredProcedureTableDependency
{
    public string TableName { get; set; } = string.Empty;
    public List<string> UsageTypes { get; set; } = new(); // Select, Insert, Update, Delete
}

public class StoredProcedureParameterInfo
{
    public string Name { get; set; } = string.Empty; // @ ile başlar
    public string Type { get; set; } = string.Empty; // SQL tipi
    public int? MaxLength { get; set; }
    public bool IsOutput { get; set; }
    public bool HasDefaultValue { get; set; }
    public bool IsNullable { get; set; } = true; // Nullable mı?
    public int Order { get; set; }
}

