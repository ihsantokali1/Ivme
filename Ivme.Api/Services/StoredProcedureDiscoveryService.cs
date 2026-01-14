using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Ivme.Api.Data;
using Ivme.Api.Models;
using System.Text.RegularExpressions;

namespace Ivme.Api.Services;

public class StoredProcedureDiscoveryService : IStoredProcedureDiscoveryService
{
    private readonly DatabaseConfig _dbConfig;
    private readonly TaskDbContext? _dbContext;
    private readonly ITaskDataService _dataService;

    public StoredProcedureDiscoveryService(
        DatabaseConfig dbConfig,
        TaskDbContext? dbContext,
        ITaskDataService dataService)
    {
        _dbConfig = dbConfig;
        _dbContext = dbContext;
        _dataService = dataService;
    }

    public async Task<List<string>> GetAllDatabasesAsync()
    {
        if (!_dbConfig.UseDatabase || string.IsNullOrEmpty(_dbConfig.Server))
        {
            return new List<string>();
        }

        var connectionString = $"Server={_dbConfig.Server};Database=master;User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
        var databases = new List<string>();

        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            var query = "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') AND state_desc = 'ONLINE' ORDER BY name";
            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                databases.Add(reader["name"].ToString() ?? "");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Discovery] Error listing databases: {ex.Message}");
        }

        return databases;
    }

    public async Task<List<StoredProcedureInfo>> DiscoverStoredProceduresAsync(List<string>? targetDatabases = null)
    {
        if (!_dbConfig.UseDatabase || string.IsNullOrEmpty(_dbConfig.Server))
        {
            return new List<StoredProcedureInfo>();
        }

        // Eğer veritabanı listesi verilmemişse ve DB'de kayıtlı seçili DB varsa onları alabiliriz
        // Ancak bu metodun parametre alması daha esnek. Sync metodunda DB'dekileri alacağız.
        if (targetDatabases == null || !targetDatabases.Any())
        {
            targetDatabases = new List<string> { _dbConfig.Database };
        }

        var procedures = new List<StoredProcedureInfo>();

        foreach (var dbName in targetDatabases)
        {
            var dbProcedures = await DiscoverProceduresInDatabaseAsync(dbName);
            procedures.AddRange(dbProcedures);
        }

        return procedures;
    }

    private async Task<List<StoredProcedureInfo>> DiscoverProceduresInDatabaseAsync(string databaseName)
    {
        var connectionString = $"Server={_dbConfig.Server};Database={databaseName};User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
        var procedures = new List<StoredProcedureInfo>();

        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT 
                    SCHEMA_NAME(schema_id) AS SchemaName,
                    name AS ProcedureName,
                    create_date AS CreatedDate,
                    modify_date AS ModifiedDate
                FROM sys.procedures
                WHERE is_ms_shipped = 0
                ORDER BY SCHEMA_NAME(schema_id), name";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var schema = reader["SchemaName"].ToString() ?? "dbo";
                var procedureName = reader["ProcedureName"].ToString() ?? "";
                var createdDate = (DateTime)reader["CreatedDate"];
                var modifiedDate = (DateTime)reader["ModifiedDate"];

                // Parametreleri al
                var parameters = await GetStoredProcedureParametersAsync(databaseName, schema, procedureName);
                
                // Tablo kullanımını al
                var tableUsage = await GetTableUsageSummaryAsync(databaseName, schema, procedureName);

                procedures.Add(new StoredProcedureInfo
                {
                    Name = procedureName,
                    Schema = schema,
                    Database = databaseName,
                    CreatedDate = createdDate,
                    ModifiedDate = modifiedDate,
                    Parameters = parameters,
                    TableUsageSummary = tableUsage.Summary,
                    TableDependencies = tableUsage.Dependencies
                });
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Discovery] Error discovering stored procedures in {databaseName}: {ex.Message}");
        }

        return procedures;
    }

    public async Task<List<StoredProcedureParameterInfo>> GetStoredProcedureParametersAsync(string database, string schema, string procedureName)
    {
        if (!_dbConfig.UseDatabase || string.IsNullOrEmpty(_dbConfig.Server))
        {
            return new List<StoredProcedureParameterInfo>();
        }

        var connectionString = $"Server={_dbConfig.Server};Database={database};User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
        var parameters = new List<StoredProcedureParameterInfo>();

        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT 
                    p.name AS ParameterName,
                    t.name AS TypeName,
                    p.max_length AS MaxLength,
                    p.is_output AS IsOutput,
                    p.has_default_value AS HasDefaultValue,
                    p.is_nullable AS IsNullable,
                    p.parameter_id AS [Order]
                FROM sys.parameters p
                INNER JOIN sys.types t ON p.user_type_id = t.user_type_id
                INNER JOIN sys.procedures pr ON p.object_id = pr.object_id
                INNER JOIN sys.schemas s ON pr.schema_id = s.schema_id
                WHERE s.name = @Schema AND pr.name = @ProcedureName
                ORDER BY p.parameter_id";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@Schema", schema);
            command.Parameters.AddWithValue("@ProcedureName", procedureName);

            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var paramName = reader["ParameterName"].ToString() ?? "";
                var typeName = reader["TypeName"].ToString() ?? "";
                var maxLength = reader["MaxLength"] != DBNull.Value ? (short?)reader["MaxLength"]: null;
                var isOutput = (bool)reader["IsOutput"];
                var hasDefaultValue = reader["HasDefaultValue"] != DBNull.Value ? (bool)reader["HasDefaultValue"] : false;
                var isNullable = reader["IsNullable"] != DBNull.Value ? (bool)reader["IsNullable"] : true;
                var order = (int)reader["Order"];

                if (!isOutput)
                {
                    parameters.Add(new StoredProcedureParameterInfo
                    {
                        Name = paramName,
                        Type = typeName,
                        MaxLength = maxLength > 0 && maxLength != -1 ? maxLength : null,
                        IsOutput = isOutput,
                        HasDefaultValue = hasDefaultValue,
                        IsNullable = isNullable,
                        Order = order
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Discovery] Error getting parameters for {database}.{schema}.{procedureName}: {ex.Message}");
        }

        return parameters;
    }

    private async Task<(string Summary, List<StoredProcedureTableDependency> Dependencies)> GetTableUsageSummaryAsync(string database, string schema, string procedureName)
    {
        var connectionString = $"Server={_dbConfig.Server};Database={database};User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
        var usageMap = new Dictionary<string, HashSet<string>>();
        string spDefinition = string.Empty;

        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            // 1. SP Tanımını (Source Code) çek
            var defQuery = @"
                SELECT m.definition 
                FROM sys.sql_modules m
                INNER JOIN sys.procedures p ON m.object_id = p.object_id
                INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
                WHERE s.name = @Schema AND p.name = @ProcedureName";
            
            using (var defCommand = new SqlCommand(defQuery, connection))
            {
                defCommand.Parameters.AddWithValue("@Schema", schema);
                defCommand.Parameters.AddWithValue("@ProcedureName", procedureName);
                spDefinition = (await defCommand.ExecuteScalarAsync())?.ToString() ?? string.Empty;
            }

            // 2. Bağımlı tabloları ve temel kullanım (Select vs Update) bilgisini çek
            var query = @"
                SELECT 
                    ISNULL(referenced_schema_name,'dbo') + '.' + referenced_entity_name as TableName,
                    is_selected,
                    is_updated
                FROM sys.dm_sql_referenced_entities(@ProcedureFullName, 'OBJECT')
                WHERE referenced_class_desc = 'OBJECT_OR_COLUMN' 
                  AND is_ambiguous = 0";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@ProcedureFullName", $"{schema}.{procedureName}");

            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var tableName = reader["TableName"].ToString() ?? "";
                var isSelected = (bool)reader["is_selected"];
                var isUpdated = (bool)reader["is_updated"];

                if (!usageMap.ContainsKey(tableName))
                    usageMap[tableName] = new HashSet<string>();

                if (isSelected) usageMap[tableName].Add("Select");
                
                if (isUpdated && !string.IsNullOrEmpty(spDefinition))
                {
                    // Spesifik operatörleri ayıkla (Regex ile)
                    var tableRef = tableName.Split('.').Last(); // Tablo ismini al (şemasız)
                    
                    // Regex patterns: Operatör + (isteğe bağlı boşluklar/hintler) + tablo ismi
                    bool foundAny = false;
                    
                    if (Regex.IsMatch(spDefinition, $@"\bINSERT\s+(?:INTO\s+)?(?:\w+\.)?\b{tableRef}\b", RegexOptions.IgnoreCase | RegexOptions.Singleline))
                    {
                        usageMap[tableName].Add("Insert");
                        foundAny = true;
                    }
                    
                    if (Regex.IsMatch(spDefinition, $@"\bUPDATE\s+(?:\w+\.)?\b{tableRef}\b", RegexOptions.IgnoreCase | RegexOptions.Singleline))
                    {
                        usageMap[tableName].Add("Update");
                        foundAny = true;
                    }

                    if (Regex.IsMatch(spDefinition, $@"\bDELETE\s+(?:FROM\s+)?(?:\w+\.)?\b{tableRef}\b", RegexOptions.IgnoreCase | RegexOptions.Singleline))
                    {
                        usageMap[tableName].Add("Delete");
                        foundAny = true;
                    }
                    
                    if (Regex.IsMatch(spDefinition, $@"\bTRUNCATE\s+TABLE\s+(?:\w+\.)?\b{tableRef}\b", RegexOptions.IgnoreCase | RegexOptions.Singleline))
                    {
                        usageMap[tableName].Add("Truncate");
                        foundAny = true;
                    }

                    // Eğer spesifik bir şey bulunamadıysa ama is_updated ise generic "Update" ekle
                    if (!foundAny)
                    {
                        usageMap[tableName].Add("Update");
                    }
                }
                else if (isUpdated)
                {
                    usageMap[tableName].Add("Update");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Discovery] Error getting table usage for {database}.{schema}.{procedureName}: {ex.Message}");
            return ("Kullanılan tablo bilgisi alınamadı.", new List<StoredProcedureTableDependency>());
        }

        var dependencies = usageMap.Select(kvp => new StoredProcedureTableDependency
        {
            TableName = kvp.Key,
            UsageTypes = kvp.Value.ToList()
        }).ToList();

        if (!dependencies.Any()) return ("Bağımlı tablo bulunamadı.", new List<StoredProcedureTableDependency>());

        var summary = "Kullanılan Tablolar: " + string.Join(", ", dependencies.Select(d => $"{d.TableName} ({string.Join("/", d.UsageTypes)})"));
        
        return (summary, dependencies);
    }

    public async Task SyncStoredProceduresToTaskItemsAsync()
    {
        if (_dbContext == null)
        {
            return;
        }

        try
        {
            // Seçili keşif veritabanlarını getir
            var targetDatabases = await _dbContext.DiscoveryDatabases
                .Where(d => d.IsSelected)
                .Select(d => d.DatabaseName)
                .ToListAsync();

            if (!targetDatabases.Any())
            {
                // Eğer hiç seçili DB yoksa, ana config'deki DB'yi kullan
                targetDatabases.Add(_dbConfig.Database);
            }

            var discoveredProcedures = await DiscoverStoredProceduresAsync(targetDatabases);
            var existingTaskItems = await _dbContext.TaskItems
                .Where(t => t.SourceType.HasValue && t.SourceType.Value == TaskSourceType.StoredProcedure)
                .Include(t => t.Parameters)
                .ToListAsync();

            var now = DateTime.UtcNow;

            foreach (var sp in discoveredProcedures)
            {
                var spFullName = $"{sp.Database}.{sp.Schema}.{sp.Name}";
                var existingTask = existingTaskItems.FirstOrDefault(t => 
                    t.StoredProcedureDatabase == sp.Database &&
                    t.StoredProcedureName == sp.Name && 
                    t.StoredProcedureSchema == sp.Schema);

                if (existingTask == null)
                {
                    var newTask = new TaskItem
                    {
                        Id = Guid.NewGuid().ToString(),
                        Name = sp.Name,
                        Description = string.IsNullOrEmpty(sp.TableUsageSummary) 
                            ? $"Stored Procedure: {spFullName}"
                            : $"Stored Procedure: {spFullName} | {sp.TableUsageSummary}",
                        SourceType = TaskSourceType.StoredProcedure,
                        StoredProcedureName = sp.Name,
                        StoredProcedureSchema = sp.Schema,
                        StoredProcedureDatabase = sp.Database,
                        LastDiscoveredAt = now,
                        IsActive = true,
                        RetryIntervalMinutes = 60,
                        RetryDelayMinutes = 60,
                        CreatedAt = now,
                        UpdatedAt = now
                    };

                    foreach (var param in sp.Parameters)
                    {
                        bool isRequired = !param.HasDefaultValue && !param.IsNullable;
                        
                        newTask.Parameters.Add(new TaskParameter
                        {
                            Id = Guid.NewGuid().ToString(),
                            TaskItemId = newTask.Id,
                            ParameterName = param.Name,
                            ParameterType = param.Type,
                            MaxLength = param.MaxLength,
                            IsRequired = isRequired,
                            IsNullable = param.IsNullable,
                            Order = param.Order,
                            CreatedAt = now,
                            UpdatedAt = now
                        });
                    }

                    _dbContext.TaskItems.Add(newTask);
                    
                    // Bağımlılıkları kaydet
                    foreach (var dep in sp.TableDependencies)
                    {
                        _dbContext.TaskTableDependencies.Add(new TaskTableDependency
                        {
                            Id = Guid.NewGuid().ToString(),
                            TaskItemId = newTask.Id,
                            DatabaseName = sp.Database,
                            SchemaName = sp.Schema,
                            ProcedureName = sp.Name,
                            TableName = dep.TableName,
                            UsageType = string.Join("/", dep.UsageTypes),
                            CreatedAt = now
                        });
                    }
                    
                    Console.WriteLine($"[SP Discovery] Created new TaskItem for SP: {spFullName}");
                }
                else
                {
                    existingTask.LastDiscoveredAt = now;
                    existingTask.IsActive = true;
                    existingTask.UpdatedAt = now;
                    
                    // Açıklamayı güncelle (tablo bilgileri değişmiş olabilir)
                    existingTask.Description = string.IsNullOrEmpty(sp.TableUsageSummary) 
                        ? $"Stored Procedure: {spFullName}"
                        : $"Stored Procedure: {spFullName} | {sp.TableUsageSummary}";

                    // Bağımlılıkları güncelle (eskileri silip yenileri ekleyerek)
                    var existingDeps = await _dbContext.TaskTableDependencies
                        .Where(d => d.TaskItemId == existingTask.Id)
                        .ToListAsync();
                    _dbContext.TaskTableDependencies.RemoveRange(existingDeps);

                    foreach (var dep in sp.TableDependencies)
                    {
                        _dbContext.TaskTableDependencies.Add(new TaskTableDependency
                        {
                            Id = Guid.NewGuid().ToString(),
                            TaskItemId = existingTask.Id,
                            DatabaseName = sp.Database,
                            SchemaName = sp.Schema,
                            ProcedureName = sp.Name,
                            TableName = dep.TableName,
                            UsageType = string.Join("/", dep.UsageTypes),
                            CreatedAt = now
                        });
                    }

                    var existingParamNames = existingTask.Parameters.Select(p => p.ParameterName).ToHashSet();
                    var discoveredParamNames = sp.Parameters.Select(p => p.Name).ToHashSet();

                    foreach (var param in sp.Parameters)
                    {
                        if (!existingParamNames.Contains(param.Name))
                        {
                            existingTask.Parameters.Add(new TaskParameter
                            {
                                Id = Guid.NewGuid().ToString(),
                                TaskItemId = existingTask.Id,
                                ParameterName = param.Name,
                                ParameterType = param.Type,
                                MaxLength = param.MaxLength,
                                IsRequired = !param.HasDefaultValue && !param.IsNullable,
                                IsNullable = param.IsNullable,
                                Order = param.Order,
                                CreatedAt = now,
                                UpdatedAt = now
                            });
                        }
                        else
                        {
                            var existingParam = existingTask.Parameters.FirstOrDefault(p => p.ParameterName == param.Name);
                            if (existingParam != null)
                            {
                                existingParam.ParameterType = param.Type;
                                existingParam.MaxLength = param.MaxLength;
                                existingParam.IsRequired = !param.HasDefaultValue && !param.IsNullable;
                                existingParam.IsNullable = param.IsNullable;
                                existingParam.UpdatedAt = now;
                            }
                        }
                    }

                    var paramsToRemove = existingTask.Parameters
                        .Where(p => !discoveredParamNames.Contains(p.ParameterName))
                        .ToList();
                    foreach (var param in paramsToRemove)
                    {
                        _dbContext.Entry(param).State = EntityState.Deleted;
                    }

                    Console.WriteLine($"[SP Discovery] Updated TaskItem for SP: {spFullName}");
                }
            }

            var discoveredSpKeys = discoveredProcedures
                .Select(sp => new { sp.Database, sp.Schema, sp.Name })
                .ToHashSet();

            foreach (var task in existingTaskItems)
            {
                if (task.StoredProcedureDatabase != null && task.StoredProcedureSchema != null && task.StoredProcedureName != null)
                {
                    var spKey = new { Database = task.StoredProcedureDatabase, Schema = task.StoredProcedureSchema, Name = task.StoredProcedureName };
                    if (!discoveredSpKeys.Contains(spKey))
                    {
                        task.IsActive = false;
                        task.UpdatedAt = now;
                        Console.WriteLine($"[SP Discovery] Deactivated TaskItem for removed SP: {task.StoredProcedureDatabase}.{task.StoredProcedureSchema}.{task.StoredProcedureName}");
                    }
                }
            }

            await _dbContext.SaveChangesAsync();
            Console.WriteLine($"[SP Discovery] Sync completed. Processed {discoveredProcedures.Count} stored procedures.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Discovery] Error during sync: {ex.Message}");
            throw;
        }
    }
}

