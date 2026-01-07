using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Ivme.Api.Data;
using Ivme.Api.Models;

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

    public async Task<List<StoredProcedureInfo>> DiscoverStoredProceduresAsync()
    {
        if (!_dbConfig.UseDatabase || string.IsNullOrEmpty(_dbConfig.Server))
        {
            return new List<StoredProcedureInfo>();
        }

        var connectionString = $"Server={_dbConfig.Server};Database={_dbConfig.Database};User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
        var procedures = new List<StoredProcedureInfo>();

        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            // SP'leri listele
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
                var parameters = await GetStoredProcedureParametersAsync(schema, procedureName);

                procedures.Add(new StoredProcedureInfo
                {
                    Name = procedureName,
                    Schema = schema,
                    CreatedDate = createdDate,
                    ModifiedDate = modifiedDate,
                    Parameters = parameters
                });
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Discovery] Error discovering stored procedures: {ex.Message}");
        }

        return procedures;
    }

    public async Task<List<StoredProcedureParameterInfo>> GetStoredProcedureParametersAsync(string schema, string procedureName)
    {
        if (!_dbConfig.UseDatabase || string.IsNullOrEmpty(_dbConfig.Server))
        {
            return new List<StoredProcedureParameterInfo>();
        }

        var connectionString = $"Server={_dbConfig.Server};Database={_dbConfig.Database};User Id={_dbConfig.UserId};Password={_dbConfig.Password};TrustServerCertificate=True;";
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

                // Output parametreleri hariç tut (genellikle task'lar için gerekmez)
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
            Console.WriteLine($"[SP Discovery] Error getting parameters for {schema}.{procedureName}: {ex.Message}");
        }

        return parameters;
    }

    public async Task SyncStoredProceduresToTaskItemsAsync()
    {
        if (_dbContext == null)
        {
            return;
        }

        try
        {
            var discoveredProcedures = await DiscoverStoredProceduresAsync();
            var existingTaskItems = await _dbContext.TaskItems
                .Where(t => t.SourceType.HasValue && t.SourceType.Value == TaskSourceType.StoredProcedure)
                .Include(t => t.Parameters)
                .ToListAsync();

            var now = DateTime.UtcNow;

            // Keşfedilen SP'leri işle
            foreach (var sp in discoveredProcedures)
            {
                var spFullName = $"{sp.Schema}.{sp.Name}";
                var existingTask = existingTaskItems.FirstOrDefault(t => 
                    t.StoredProcedureName == sp.Name && 
                    t.StoredProcedureSchema == sp.Schema);

                if (existingTask == null)
                {
                    // Yeni SP - TaskItem oluştur
                    var newTask = new TaskItem
                    {
                        Id = Guid.NewGuid().ToString(),
                        Name = sp.Name,
                        Description = $"Stored Procedure: {spFullName}",
                        SourceType = TaskSourceType.StoredProcedure,
                        StoredProcedureName = sp.Name,
                        StoredProcedureSchema = sp.Schema,
                        LastDiscoveredAt = now,
                        IsActive = true,
                        RetryIntervalMinutes = 60, // Varsayılan değerler
                        RetryDelayMinutes = 60,
                        CreatedAt = now,
                        UpdatedAt = now
                    };

                    // Parametreleri ekle
                    foreach (var param in sp.Parameters)
                    {
                        // Parametre zorunlu mu? 
                        // - Varsayılan değeri yoksa VE nullable değilse zorunlu
                        // - Varsayılan değeri varsa zorunlu değil
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
                    Console.WriteLine($"[SP Discovery] Created new TaskItem for SP: {spFullName}");
                }
                else
                {
                    // Mevcut SP - güncelle
                    existingTask.LastDiscoveredAt = now;
                    existingTask.IsActive = true;
                    existingTask.UpdatedAt = now;

                    // Parametreleri senkronize et
                    var existingParamNames = existingTask.Parameters.Select(p => p.ParameterName).ToHashSet();
                    var discoveredParamNames = sp.Parameters.Select(p => p.Name).ToHashSet();

                    // Yeni parametreleri ekle
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
                            // Mevcut parametreyi güncelle
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

                    // Silinen parametreleri kaldır (SP'den kaldırılmışsa)
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

            // Artık mevcut olmayan SP'leri pasifleştir
            var discoveredSpNames = discoveredProcedures
                .Select(sp => new { sp.Schema, sp.Name })
                .ToHashSet();

            foreach (var task in existingTaskItems)
            {
                if (task.StoredProcedureSchema != null && task.StoredProcedureName != null)
                {
                    var spKey = new { Schema = task.StoredProcedureSchema, Name = task.StoredProcedureName };
                    if (!discoveredSpNames.Contains(spKey))
                    {
                        task.IsActive = false;
                        task.UpdatedAt = now;
                        Console.WriteLine($"[SP Discovery] Deactivated TaskItem for removed SP: {task.StoredProcedureSchema}.{task.StoredProcedureName}");
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

