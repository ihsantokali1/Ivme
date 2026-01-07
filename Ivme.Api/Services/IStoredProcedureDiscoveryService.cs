using Ivme.Api.Models;

namespace Ivme.Api.Services;

public interface IStoredProcedureDiscoveryService
{
    /// <summary>
    /// SQL Server'dan stored procedure'leri keşfeder
    /// </summary>
    Task<List<StoredProcedureInfo>> DiscoverStoredProceduresAsync();
    
    /// <summary>
    /// SP'leri TaskItem'lara senkronize eder
    /// </summary>
    Task SyncStoredProceduresToTaskItemsAsync();
    
    /// <summary>
    /// Belirli bir SP'nin parametrelerini getirir
    /// </summary>
    Task<List<StoredProcedureParameterInfo>> GetStoredProcedureParametersAsync(string schema, string procedureName);
}

public class StoredProcedureInfo
{
    public string Name { get; set; } = string.Empty;
    public string Schema { get; set; } = "dbo";
    public DateTime CreatedDate { get; set; }
    public DateTime ModifiedDate { get; set; }
    public List<StoredProcedureParameterInfo> Parameters { get; set; } = new();
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

