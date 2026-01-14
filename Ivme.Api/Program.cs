using Ivme.Api.Services;
using Ivme.Api.Data;
using Ivme.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// DatabaseConfig'i yükle
var dbConfig = builder.Configuration.GetSection("DatabaseConfig").Get<DatabaseConfig>() ?? new DatabaseConfig();

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.WriteIndented = true;
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// CORS ayarları
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000", "https://localhost:7268")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Veritabanı yapılandırması
if (dbConfig.UseDatabase && !string.IsNullOrEmpty(dbConfig.Server) && !string.IsNullOrEmpty(dbConfig.UserId))
{
    var connectionString = $"Server={dbConfig.Server};Database={dbConfig.Database};User Id={dbConfig.UserId};Password={dbConfig.Password};TrustServerCertificate=True;";
    builder.Services.AddDbContext<TaskDbContext>(options =>
        options.UseSqlServer(connectionString, sqlOptions => 
        {
            sqlOptions.EnableRetryOnFailure(
                maxRetryCount: 5, 
                maxRetryDelay: TimeSpan.FromSeconds(30), 
                errorNumbersToAdd: null);
        }));
    Console.WriteLine($"[DB] Database mode enabled. Server: {dbConfig.Server}, Database: {dbConfig.Database}");
}
else
{
    Console.WriteLine("[DB] JSON file mode enabled (UseDatabase=false or missing credentials)");
}

// DatabaseConfig'i singleton olarak kaydet
builder.Services.AddSingleton(dbConfig);

// JWT Authentication
var jwtSecretKey = builder.Configuration["Jwt:SecretKey"] ?? "YourSuperSecretKeyThatShouldBeAtLeast32CharactersLong!";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "IvmeApi";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "IvmeClient";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();

// JWT ve User servislerini kaydet
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IUserService>(sp =>
{
    var dbConfig = sp.GetRequiredService<DatabaseConfig>();
    var dbContext = dbConfig.UseDatabase ? sp.GetService<TaskDbContext>() : null;
    return new UserService(dbContext, dbConfig);
});
builder.Services.AddScoped<IPermissionService>(sp =>
{
    var dbConfig = sp.GetRequiredService<DatabaseConfig>();
    var dbContext = dbConfig.UseDatabase ? sp.GetService<TaskDbContext>() : null;
    return new PermissionService(dbContext, dbConfig);
});
builder.Services.AddScoped<IRoleService>(sp =>
{
    var dbContext = sp.GetRequiredService<TaskDbContext>();
    return new RoleService(dbContext);
});

// Servisleri kaydet
// TaskDataService'i factory ile kaydet (DB context'i inject edebilmek için)
builder.Services.AddScoped<ITaskDataService>(sp =>
{
    var dbConfig = sp.GetRequiredService<DatabaseConfig>();
    var dbContext = dbConfig.UseDatabase ? sp.GetService<TaskDbContext>() : null;
    return new TaskDataService(dbConfig, dbContext);
});
builder.Services.AddScoped<ITaskManagementService>(sp =>
{
    var dataService = sp.GetRequiredService<ITaskDataService>();
    var executionHistoryService = sp.GetRequiredService<IExecutionHistoryService>();
    var dbConfig = sp.GetRequiredService<DatabaseConfig>();
    var dbContext = dbConfig.UseDatabase ? sp.GetService<TaskDbContext>() : null;
    var serviceScopeFactory = sp.GetRequiredService<IServiceScopeFactory>();
    return new TaskManagementService(dataService, executionHistoryService, dbConfig, dbContext, serviceScopeFactory);
});
// ExecutionHistoryService'i factory ile kaydet (DB context'i inject edebilmek için)
builder.Services.AddScoped<IExecutionHistoryService>(sp =>
{
    var dbConfig = sp.GetRequiredService<DatabaseConfig>();
    var dbContext = dbConfig.UseDatabase ? sp.GetService<TaskDbContext>() : null;
    var dataService = sp.GetRequiredService<ITaskDataService>();
    return new ExecutionHistoryService(dbConfig, dbContext, dataService);
});
// StoredProcedureDiscoveryService'i factory ile kaydet
builder.Services.AddScoped<IStoredProcedureDiscoveryService>(sp =>
{
    var dbConfig = sp.GetRequiredService<DatabaseConfig>();
    var dbContext = dbConfig.UseDatabase ? sp.GetService<TaskDbContext>() : null;
    var dataService = sp.GetRequiredService<ITaskDataService>();
    return new StoredProcedureDiscoveryService(dbConfig, dbContext, dataService);
});
builder.Services.AddScoped<IFlowItemService, FlowItemService>();
builder.Services.AddScoped<IFlowGroupAssignmentService, FlowGroupAssignmentService>();
builder.Services.AddScoped<IFlowScheduleService, FlowScheduleService>();
var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// CORS'u HTTPS redirection'dan önce kullan
app.UseCors("AllowReactApp");

// Development'ta HTTPS redirection'ı devre dışı bırak
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Authentication ve Authorization middleware'leri
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Yeni execution history tablolarını kontrol et ve yoksa oluştur
async Task EnsureExecutionHistoryTablesAsync(TaskDbContext dbContext)
{
    try
    {
        var connection = dbContext.Database.GetDbConnection();
        await connection.OpenAsync();
        
        using var command = connection.CreateCommand();
        
        // TaskExecutionHistories tablosunu kontrol et
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[TaskExecutionHistories] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [TaskItemId] NVARCHAR(50) NOT NULL,
                    [GroupId] NVARCHAR(50) NULL,
                    [GroupExecutionId] NVARCHAR(50) NULL,
                    [StartTime] DATETIME2 NOT NULL,
                    [EndTime] DATETIME2 NULL,
                    [FinalStatus] NVARCHAR(20) NOT NULL,
                    [ErrorCount] INT NOT NULL DEFAULT 0,
                    [ErrorMessage] NVARCHAR(2000) NULL,
                    [LastErrorTime] DATETIME2 NULL,
                    [RetryStartTime] DATETIME2 NULL,
                    [RetryCount] INT NOT NULL DEFAULT 0,
                    [Progress] INT NOT NULL DEFAULT 0,
                    [TaskParameterValues] NVARCHAR(MAX) NULL,
                    [TriggeredBy] NVARCHAR(200) NULL,
                    [FlowItemId] NVARCHAR(50) NULL,
                    [FlowItemExecutionId] NVARCHAR(50) NULL,
                    [CreatedAt] DATETIME2 NOT NULL
                );
                
                CREATE INDEX [IX_TaskExecutionHistories_TaskItemId] ON [TaskExecutionHistories]([TaskItemId]);
                CREATE INDEX [IX_TaskExecutionHistories_GroupId] ON [TaskExecutionHistories]([GroupId]);
                CREATE INDEX [IX_TaskExecutionHistories_GroupExecutionId] ON [TaskExecutionHistories]([GroupExecutionId]);
                CREATE INDEX [IX_TaskExecutionHistories_FlowItemId] ON [TaskExecutionHistories]([FlowItemId]);
                CREATE INDEX [IX_TaskExecutionHistories_FlowItemExecutionId] ON [TaskExecutionHistories]([FlowItemExecutionId]);
                CREATE INDEX [IX_TaskExecutionHistories_StartTime] ON [TaskExecutionHistories]([StartTime]);
            END
            ELSE
            BEGIN
                -- Mevcut tabloya GroupExecutionId kolonunu ekle (yoksa)
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'GroupExecutionId')
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [GroupExecutionId] NVARCHAR(50) NULL;
                    CREATE INDEX [IX_TaskExecutionHistories_GroupExecutionId] ON [TaskExecutionHistories]([GroupExecutionId]);
                END
                
                -- Mevcut tabloya TaskParameterValues kolonunu ekle (yoksa)
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'TaskParameterValues')
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [TaskParameterValues] NVARCHAR(MAX) NULL;
                END
                
                -- Mevcut tabloya RetryCount kolonunu ekle (yoksa)
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'RetryCount')
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [RetryCount] INT NOT NULL DEFAULT 0;
                END
                
                -- Mevcut tabloya TriggeredBy kolonunu ekle (yoksa)
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'TriggeredBy')
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [TriggeredBy] NVARCHAR(200) NULL;
                END

                -- Mevcut tabloya FlowItemId kolonunu ekle (yoksa)
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'FlowItemId')
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [FlowItemId] NVARCHAR(50) NULL;
                    CREATE INDEX [IX_TaskExecutionHistories_FlowItemId] ON [TaskExecutionHistories]([FlowItemId]);
                END

                -- Mevcut tabloya FlowItemExecutionId kolonunu ekle (yoksa)
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'FlowItemExecutionId')
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [FlowItemExecutionId] NVARCHAR(50) NULL;
                    CREATE INDEX [IX_TaskExecutionHistories_FlowItemExecutionId] ON [TaskExecutionHistories]([FlowItemExecutionId]);
                END
            END";
        await command.ExecuteNonQueryAsync();

        // Mevcut TaskItems tablosuna TimeoutMinutes kolonunu ekle (eğer yoksa)
        command.CommandText = @"
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND type in (N'U'))
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'TimeoutMinutes')
                BEGIN
                    ALTER TABLE [dbo].[TaskItems]
                    ADD [TimeoutMinutes] INT NOT NULL DEFAULT 720;
                    PRINT '[DB] Added TimeoutMinutes column to TaskItems table';
                END
            END";
        await command.ExecuteNonQueryAsync();
        
        // GroupExecutionHistories tablosunu kontrol et
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[GroupExecutionHistories] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [GroupId] NVARCHAR(50) NOT NULL,
                    [StartTime] DATETIME2 NOT NULL,
                    [EndTime] DATETIME2 NULL,
                    [TotalTasks] INT NOT NULL DEFAULT 0,
                    [CompletedTasks] INT NOT NULL DEFAULT 0,
                    [FailedTasks] INT NOT NULL DEFAULT 0,
                    [TotalErrors] INT NOT NULL DEFAULT 0,
                    [TriggeredBy] NVARCHAR(200) NULL,
                    [FlowItemId] NVARCHAR(50) NULL,
                    [FlowItemExecutionId] NVARCHAR(50) NULL,
                    [CreatedAt] DATETIME2 NOT NULL
                );
                
                CREATE INDEX [IX_GroupExecutionHistories_GroupId] ON [GroupExecutionHistories]([GroupId]);
                CREATE INDEX [IX_GroupExecutionHistories_FlowItemId] ON [GroupExecutionHistories]([FlowItemId]);
                CREATE INDEX [IX_GroupExecutionHistories_FlowItemExecutionId] ON [GroupExecutionHistories]([FlowItemExecutionId]);
                CREATE INDEX [IX_GroupExecutionHistories_StartTime] ON [GroupExecutionHistories]([StartTime]);
            END";
        await command.ExecuteNonQueryAsync();
        
        // TaskParameters tablosunu kontrol et
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskParameters]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[TaskParameters] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [TaskItemId] NVARCHAR(50) NOT NULL,
                    [ParameterName] NVARCHAR(100) NOT NULL,
                    [ParameterType] NVARCHAR(50) NOT NULL,
                    [MaxLength] INT NULL,
                    [IsRequired] BIT NOT NULL DEFAULT 0,
                    [IsNullable] BIT NOT NULL DEFAULT 1,
                    [DefaultValue] NVARCHAR(500) NULL,
                    [Order] INT NOT NULL DEFAULT 0,
                    [Description] NVARCHAR(1000) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL,
                    FOREIGN KEY ([TaskItemId]) REFERENCES [dbo].[TaskItems]([Id]) ON DELETE CASCADE
                );
                
                CREATE INDEX [IX_TaskParameters_TaskItemId] ON [TaskParameters]([TaskItemId]);
                CREATE UNIQUE INDEX [IX_TaskParameters_TaskItemId_ParameterName] ON [TaskParameters]([TaskItemId], [ParameterName]);
            END";
        await command.ExecuteNonQueryAsync();
        
        // Mevcut TaskParameters tablosuna IsNullable kolonunu ekle (eğer yoksa)
        command.CommandText = @"
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskParameters]') AND type in (N'U'))
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskParameters]') AND name = 'IsNullable')
                BEGIN
                    ALTER TABLE [dbo].[TaskParameters]
                    ADD [IsNullable] BIT NOT NULL DEFAULT 1;
                    PRINT '[DB] Added IsNullable column to TaskParameters table';
                END
            END";
        await command.ExecuteNonQueryAsync();
        
        // RolePermissions tablosunu kontrol et ve yoksa oluştur
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RolePermissions]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[RolePermissions] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [Role] NVARCHAR(50) NOT NULL,
                    [Permission] NVARCHAR(100) NOT NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                
                CREATE UNIQUE INDEX [IX_RolePermissions_Role_Permission] ON [RolePermissions]([Role], [Permission]);
                PRINT '[DB] RolePermissions table created successfully';
            END
            ELSE
            BEGIN
                PRINT '[DB] RolePermissions table already exists';
            END";
        await command.ExecuteNonQueryAsync();
        
        // Roles tablosunu kontrol et ve yoksa oluştur
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Roles]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[Roles] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [Name] NVARCHAR(50) NOT NULL,
                    [Description] NVARCHAR(500) NULL,
                    [IsActive] BIT NOT NULL DEFAULT 1,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                
                CREATE UNIQUE INDEX [IX_Roles_Name] ON [Roles]([Name]);
                PRINT '[DB] Roles table created successfully';
            END
            ELSE
            BEGIN
                PRINT '[DB] Roles table already exists';
            END";
        await command.ExecuteNonQueryAsync();
        
        // TriggeredBy kolonlarının boyutunu artır (TaskExecutionHistories ve GroupExecutionHistories)
        command.CommandText = @"
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND type in (N'U'))
            BEGIN
                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'TriggeredBy' AND max_length < 200)
                BEGIN
                    ALTER TABLE [dbo].[TaskExecutionHistories]
                    ALTER COLUMN [TriggeredBy] NVARCHAR(200) NULL;
                    PRINT '[DB] Increased TriggeredBy column size in TaskExecutionHistories';
                END
            END

            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND type in (N'U'))
            BEGIN
                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'TriggeredBy' AND max_length < 200)
                BEGIN
                    ALTER TABLE [dbo].[GroupExecutionHistories]
                    ALTER COLUMN [TriggeredBy] NVARCHAR(200) NULL;
                    PRINT '[DB] Increased TriggeredBy column size in GroupExecutionHistories';
                END
            END";
        await command.ExecuteNonQueryAsync();

        // FlowItems tablosunu kontrol et ve yoksa oluştur
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowItems]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowItems] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [Name] NVARCHAR(200) NOT NULL,
                    [Description] NVARCHAR(1000) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                PRINT '[DB] FlowItems table created successfully';
            END
            ELSE
            BEGIN
                PRINT '[DB] FlowItems table already exists';
            END";
        await command.ExecuteNonQueryAsync();

        // FlowGroupAssignments tablosunu kontrol et ve yoksa oluştur
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowGroupAssignments] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [FlowItemId] NVARCHAR(50) NOT NULL,
                    [GroupId] NVARCHAR(50) NOT NULL,
                    [Order] INT NOT NULL,
                    [PrerequisiteGroupIds] NVARCHAR(MAX) NULL,
                    [Status] NVARCHAR(20) NULL,
                    [ErrorMessage] NVARCHAR(2000) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                
                CREATE UNIQUE INDEX [IX_FlowGroupAssignments_FlowItemId_GroupId] ON [FlowGroupAssignments]([FlowItemId], [GroupId]);
                PRINT '[DB] FlowGroupAssignments table created successfully';
            END
            ELSE
            BEGIN
                PRINT '[DB] FlowGroupAssignments table already exists';
            END";
        await command.ExecuteNonQueryAsync();

        // FlowGroupAssignments tablosunu kontrol et ve yoksa oluştur
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowGroupAssignments] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [FlowItemId] NVARCHAR(50) NOT NULL,
                    [GroupId] NVARCHAR(50) NOT NULL,
                    [Order] INT NOT NULL DEFAULT 0,
                    [PrerequisiteGroupIds] NVARCHAR(MAX) NULL,
                    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
                    [StartTime] DATETIME2 NULL,
                    [EndTime] DATETIME2 NULL,
                    [LastErrorTime] DATETIME2 NULL,
                    [Progress] INT NOT NULL DEFAULT 0,
                    [ErrorMessage] NVARCHAR(2000) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                
                CREATE UNIQUE INDEX [IX_FlowGroupAssignments_FlowItem_Group] ON [FlowGroupAssignments]([FlowItemId], [GroupId]);
                PRINT '[DB] FlowGroupAssignments table created successfully';
            END
            ELSE
            BEGIN
                PRINT '[DB] FlowGroupAssignments table already exists';
            END";
        await command.ExecuteNonQueryAsync();

        Console.WriteLine("[DB] ✓ Execution history, task parameters, role permissions, roles tables verified/created");
        await connection.CloseAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] WARNING: Could not create execution history tables: {ex.Message}");
        Console.WriteLine($"[DB] Please run the SQL script manually: Migrations/CreateDatabase.sql (lines 89-132)");
    }
    }

// Yeni flow tablolarını kontrol et ve yoksa oluştur
async Task EnsureFlowTablesAsync(TaskDbContext dbContext)
{
    try
    {
        var connection = dbContext.Database.GetDbConnection();
        // Bağlantı kapalıysa aç (açıksa işlem yapma)
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        
        using var command = connection.CreateCommand();
        
        // FlowItems tablosunu kontrol et
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowItems]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowItems] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [Name] NVARCHAR(200) NOT NULL,
                    [Description] NVARCHAR(1000) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                PRINT '[DB] FlowItems table created successfully';
            END";
        await command.ExecuteNonQueryAsync();

        // FlowGroupAssignments tablosunu kontrol et
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowGroupAssignments] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [FlowItemId] NVARCHAR(50) NOT NULL,
                    [GroupId] NVARCHAR(50) NOT NULL,
                    [Order] INT NOT NULL DEFAULT 0,
                    [PrerequisiteGroupIds] NVARCHAR(MAX) NULL, -- JSON formatında
                    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
                    [StartTime] DATETIME2 NULL,
                    [EndTime] DATETIME2 NULL,
                    [LastErrorTime] DATETIME2 NULL,
                    [Progress] INT NOT NULL DEFAULT 0,
                    [ErrorMessage] NVARCHAR(2000) NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                
                CREATE UNIQUE INDEX [IX_FlowGroupAssignments_FlowItemId_GroupId] ON [FlowGroupAssignments]([FlowItemId], [GroupId]);
                PRINT '[DB] FlowGroupAssignments table created successfully';
            END
            ELSE
            BEGIN
                -- Mevcut tabloya eksik kolonları ekle
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND name = 'StartTime')
                BEGIN
                    ALTER TABLE [dbo].[FlowGroupAssignments] ADD [StartTime] DATETIME2 NULL;
                    PRINT '[DB] Added StartTime to FlowGroupAssignments';
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND name = 'EndTime')
                BEGIN
                    ALTER TABLE [dbo].[FlowGroupAssignments] ADD [EndTime] DATETIME2 NULL;
                    PRINT '[DB] Added EndTime to FlowGroupAssignments';
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND name = 'LastErrorTime')
                BEGIN
                    ALTER TABLE [dbo].[FlowGroupAssignments] ADD [LastErrorTime] DATETIME2 NULL;
                    PRINT '[DB] Added LastErrorTime to FlowGroupAssignments';
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND name = 'Progress')
                BEGIN
                    ALTER TABLE [dbo].[FlowGroupAssignments] ADD [Progress] INT NOT NULL DEFAULT 0;
                    PRINT '[DB] Added Progress to FlowGroupAssignments';
                END
                
                 IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND name = 'ErrorMessage')
                BEGIN
                    ALTER TABLE [dbo].[FlowGroupAssignments] ADD [ErrorMessage] NVARCHAR(2000) NULL;
                    PRINT '[DB] Added ErrorMessage to FlowGroupAssignments';
                END

                 IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FlowGroupAssignments]') AND name = 'Status')
                BEGIN
                    ALTER TABLE [dbo].[FlowGroupAssignments] ADD [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending';
                    PRINT '[DB] Added Status to FlowGroupAssignments';
                END
            END";
        await command.ExecuteNonQueryAsync();

        // FlowSchedules tablosunu kontrol et ve yoksa oluştur
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowSchedules]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowSchedules] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [FlowItemId] NVARCHAR(50) NOT NULL,
                    [WorkPeriod] NVARCHAR(20) NOT NULL,
                    [StartTime] TIME NOT NULL,
                    [RestartOnError] BIT NOT NULL DEFAULT 0,
                    [IsActive] BIT NOT NULL DEFAULT 1,
                    [LastRunTime] DATETIME2 NULL,
                    [CreatedAt] DATETIME2 NOT NULL,
                    [UpdatedAt] DATETIME2 NOT NULL
                );
                
                CREATE UNIQUE INDEX [IX_FlowSchedules_FlowItemId] ON [FlowSchedules]([FlowItemId]);
                PRINT '[DB] FlowSchedules table created successfully';
            END";
        await command.ExecuteNonQueryAsync();

        // FlowExecutionHistories - Akış çalışma geçmişi tablosu
        command.CommandText = @"
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FlowExecutionHistories]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[FlowExecutionHistories] (
                    [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                    [FlowItemId] NVARCHAR(50) NOT NULL,
                    [StartTime] DATETIME2 NOT NULL,
                    [EndTime] DATETIME2 NULL,
                    [Status] NVARCHAR(MAX) NOT NULL DEFAULT 'Running',
                    [ErrorCount] INT NOT NULL DEFAULT 0,
                    [TriggeredBy] NVARCHAR(MAX) NULL
                );
                
                CREATE INDEX [IX_FlowExecutionHistories_FlowItemId] ON [FlowExecutionHistories]([FlowItemId]);
                CREATE INDEX [IX_FlowExecutionHistories_StartTime] ON [FlowExecutionHistories]([StartTime]);
                PRINT '[DB] FlowExecutionHistories table created successfully';
            END";
        await command.ExecuteNonQueryAsync();

        // GroupExecutionHistories tablosunu güncelle - Flow identifiers ekle
        command.CommandText = @"
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND type in (N'U'))
            BEGIN
                 -- FlowExecutionId -> FlowItemExecutionId olarak güncelle (eğer varsa)
                 IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowExecutionId')
                    AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemExecutionId')
                 BEGIN
                    EXEC sp_rename 'dbo.GroupExecutionHistories.FlowExecutionId', 'FlowItemExecutionId', 'COLUMN';
                    PRINT '[DB] Renamed FlowExecutionId to FlowItemExecutionId in GroupExecutionHistories';
                 END
                 ELSE IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemExecutionId')
                 BEGIN
                    ALTER TABLE [dbo].[GroupExecutionHistories] ADD [FlowItemExecutionId] NVARCHAR(50) NULL;
                    PRINT '[DB] Added FlowItemExecutionId to GroupExecutionHistories';
                 END

                 IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemId')
                 BEGIN
                    ALTER TABLE [dbo].[GroupExecutionHistories] ADD [FlowItemId] NVARCHAR(50) NULL;
                    PRINT '[DB] Added FlowItemId to GroupExecutionHistories';
                 END

                 -- Index'leri oluştur
                 IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'IX_GroupExecutionHistories_FlowItemId')
                    CREATE INDEX [IX_GroupExecutionHistories_FlowItemId] ON [GroupExecutionHistories]([FlowItemId]);
                 
                 IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'IX_GroupExecutionHistories_FlowItemExecutionId')
                    CREATE INDEX [IX_GroupExecutionHistories_FlowItemExecutionId] ON [GroupExecutionHistories]([FlowItemExecutionId]);
            END";
        await command.ExecuteNonQueryAsync();
        
        Console.WriteLine("[DB] ✓ Flow tables verified/created");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] WARNING: Could not create flow tables: {ex.Message}");
    }
}

// Veritabanı tablolarını otomatik oluştur (migration olmadan) - app build edildikten sonra
if (dbConfig.UseDatabase && !string.IsNullOrEmpty(dbConfig.Server) && !string.IsNullOrEmpty(dbConfig.UserId))
{
    try
    {
        using var scope = app.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<TaskDbContext>();
        
        Console.WriteLine($"[DB] Attempting to connect to database '{dbConfig.Database}'...");
        
        // Database'in var olduğunu kontrol et
        if (await dbContext.Database.CanConnectAsync())
        {
            Console.WriteLine($"[DB] Connected to database '{dbConfig.Database}' successfully");
            
            // Sadece tabloları oluştur (database zaten var)
            Console.WriteLine("[DB] Creating/verifying tables...");
            var created = await dbContext.Database.EnsureCreatedAsync();
            if (created)
            {
                Console.WriteLine("[DB] ✓ Database tables created successfully");
            }
            else
            {
                Console.WriteLine("[DB] ✓ Database tables already exist");
                
                // Yeni execution history tablolarını kontrol et ve yoksa oluştur
                await EnsureExecutionHistoryTablesAsync(dbContext);

                // Yeni flow tablolarını kontrol et ve yoksa oluştur
                await EnsureFlowTablesAsync(dbContext);
            }
            
            // Varsayılan rolleri oluştur (yoksa)
            await EnsureDefaultRolesAsync(dbContext);
            
            // Varsayılan admin kullanıcısını oluştur (yoksa) - her durumda kontrol et
            await EnsureDefaultAdminUserAsync(dbContext, scope.ServiceProvider);
            
            // Varsayılan yetkileri oluştur (yoksa)
            var permissionService = scope.ServiceProvider.GetRequiredService<IPermissionService>();
            await permissionService.InitializeDefaultPermissionsAsync();
            Console.WriteLine("[AUTH] ✓ Default permissions initialized");
        }
        else
        {
            Console.WriteLine($"[DB] ✗ WARNING: Cannot connect to database '{dbConfig.Database}'. Please ensure:");
            Console.WriteLine($"[DB]   1. Database '{dbConfig.Database}' exists on server '{dbConfig.Server}'");
            Console.WriteLine($"[DB]   2. User '{dbConfig.UserId}' has access to the database");
            Console.WriteLine($"[DB]   3. Run the SQL script manually: Migrations/CreateDatabase.sql");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] ✗ ERROR: Database connection/creation error: {ex.Message}");
        Console.WriteLine($"[DB] Error type: {ex.GetType().Name}");
        
        if (ex.Message.Contains("Invalid object name"))
        {
            Console.WriteLine($"[DB] Tables do not exist. Please run the SQL script: Migrations/CreateDatabase.sql");
            Console.WriteLine($"[DB] Or ensure the user has CREATE TABLE permission.");
        }
        else if (ex.Message.Contains("CREATE DATABASE permission"))
        {
            Console.WriteLine($"[DB] NOTE: Database '{dbConfig.Database}' must be created by a DBA or admin user.");
            Console.WriteLine($"[DB] After database is created, tables will be created automatically on next startup.");
        }
        else
        {
            Console.WriteLine("[DB] Please check:");
            Console.WriteLine($"   1. Database '{dbConfig.Database}' exists on server '{dbConfig.Server}'");
            Console.WriteLine($"   2. Connection credentials are correct");
            Console.WriteLine($"   3. User has necessary permissions (CREATE TABLE, etc.)");
            Console.WriteLine($"   4. Run the SQL script manually: Migrations/CreateDatabase.sql");
        }
    }
}

// Varsayılan admin kullanıcısını oluştur
async Task EnsureDefaultAdminUserAsync(TaskDbContext dbContext, IServiceProvider serviceProvider)
{
    try
    {
        // Users tablosunun var olup olmadığını kontrol et
        try
        {
            var existingAdmin = await dbContext.Users.FirstOrDefaultAsync(u => u.Username == "admin");
            if (existingAdmin == null)
            {
                using var scope = serviceProvider.CreateScope();
                var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
                
                var adminUser = await userService.CreateUserAsync(
                    "admin",
                    "admin123",
                    "admin@ivme.com",
                    "Admin"
                );
                
                Console.WriteLine("[AUTH] ✓ Default admin user created (username: admin, password: admin123)");
                Console.WriteLine("[AUTH] ⚠ WARNING: Change the default admin password in production!");
            }
            else
            {
                // Mevcut admin kullanıcısının hash'ini kontrol et ve gerekirse güncelle
                using var scope = serviceProvider.CreateScope();
                var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
                var isValid = userService.ValidatePassword("admin123", existingAdmin.PasswordHash);
                
                if (!isValid)
                {
                    Console.WriteLine("[AUTH] ⚠ Admin user exists but password hash is invalid. Updating...");
                    existingAdmin.PasswordHash = userService.HashPassword("admin123");
                    existingAdmin.UpdatedAt = DateTime.Now;
                    await dbContext.SaveChangesAsync();
                    Console.WriteLine("[AUTH] ✓ Admin user password hash updated successfully");
                }
                else
                {
                    Console.WriteLine("[AUTH] ✓ Default admin user already exists and password is valid");
                }
            }
        }
        catch (Exception ex) when (ex.Message.Contains("Invalid object name") || ex.Message.Contains("does not exist"))
        {
            // Users tablosu yoksa oluştur
            Console.WriteLine("[AUTH] Users table does not exist, creating...");
            await dbContext.Database.ExecuteSqlRawAsync(@"
                IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND type in (N'U'))
                BEGIN
                    CREATE TABLE [dbo].[Users] (
                        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
                        [Username] NVARCHAR(100) NOT NULL,
                        [PasswordHash] NVARCHAR(500) NOT NULL,
                        [Email] NVARCHAR(200) NULL,
                        [Role] NVARCHAR(20) NOT NULL DEFAULT 'User',
                        [IsActive] BIT NOT NULL DEFAULT 1,
                        [CreatedAt] DATETIME2 NOT NULL,
                        [UpdatedAt] DATETIME2 NOT NULL
                    );
                    CREATE UNIQUE INDEX [IX_Users_Username] ON [Users]([Username]);
                END
            ");
            
            // Tekrar dene
            using var scope = serviceProvider.CreateScope();
            var userService = scope.ServiceProvider.GetRequiredService<IUserService>();
            
            var adminUser = await userService.CreateUserAsync(
                "admin",
                "admin123",
                "admin@ivme.com",
                "Admin"
            );
            
            Console.WriteLine("[AUTH] ✓ Users table created and default admin user created (username: admin, password: admin123)");
            Console.WriteLine("[AUTH] ⚠ WARNING: Change the default admin password in production!");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[AUTH] WARNING: Could not create default admin user: {ex.Message}");
        Console.WriteLine($"[AUTH] Stack trace: {ex.StackTrace}");
    }
}

// Varsayılan rolleri oluştur
async Task EnsureDefaultRolesAsync(TaskDbContext dbContext)
{
    try
    {
        var defaultRoles = new[] { "Admin", "User" };
        
        foreach (var roleName in defaultRoles)
        {
            var existingRole = await dbContext.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
            if (existingRole == null)
            {
                dbContext.Roles.Add(new Role
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = roleName,
                    Description = roleName == "Admin" ? "Yönetici rolü - Tüm yetkilere sahip" : "Normal kullanıcı rolü",
                    IsActive = true,
                    CreatedAt = DateTime.Now,
                    UpdatedAt = DateTime.Now
                });
            }
        }
        
        await dbContext.SaveChangesAsync();
        Console.WriteLine("[AUTH] ✓ Default roles verified/created");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[AUTH] WARNING: Could not create default roles: {ex.Message}");
    }
}

// Periyodik olarak stored procedure'leri senkronize et (her 5 dakikada bir)
var spSyncTimer = new System.Timers.Timer(TimeSpan.FromMinutes(5).TotalMilliseconds)
{
    AutoReset = true,
    Enabled = dbConfig.UseDatabase // Sadece database modunda aktif
};

spSyncTimer.Elapsed += async (sender, e) =>
{
    try
    {
        using var scope = app.Services.CreateScope();
        var spDiscoveryService = scope.ServiceProvider.GetRequiredService<IStoredProcedureDiscoveryService>();
        await spDiscoveryService.SyncStoredProceduresToTaskItemsAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[SP Sync Timer] Error: {ex.Message}");
    }
};

// İlk senkronizasyonu başlat (uygulama başladığında)
if (dbConfig.UseDatabase)
{
    _ = Task.Run(async () =>
    {
        await Task.Delay(TimeSpan.FromSeconds(10)); // Uygulama tamamen başladıktan sonra
        try
        {
            using var scope = app.Services.CreateScope();
            var spDiscoveryService = scope.ServiceProvider.GetRequiredService<IStoredProcedureDiscoveryService>();
            await spDiscoveryService.SyncStoredProceduresToTaskItemsAsync();
            Console.WriteLine("[SP Sync] Initial synchronization completed.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SP Sync] Initial sync error: {ex.Message}");
        }
    });
}

// Periyodik olarak task item durumlarını kontrol et
var timer = new System.Timers.Timer(TimeSpan.FromMinutes(1).TotalMilliseconds)
{
    AutoReset = true,
    Enabled = true
};

timer.Elapsed += async (sender, e) =>
{
    try
    {
        var now = DateTime.Now;
        Console.WriteLine($"[Timer] Timer ticked at {now:yyyy-MM-dd HH:mm:ss}");
        
        using var scope = app.Services.CreateScope();
        var managementService = scope.ServiceProvider.GetRequiredService<ITaskManagementService>();
        await managementService.CheckAndUpdateTaskItemStatusesAsync();
        await managementService.CheckAndTriggerScheduledGroupsAsync();
        await managementService.CheckAndTriggerScheduledFlowsAsync();
    }
    catch (Exception ex)
    {
        // Hataları logla ama uygulamayı durdurma
        Console.WriteLine($"[Timer] ERROR: Task item status check error: {ex.Message}");
        Console.WriteLine($"[Timer] Stack trace: {ex.StackTrace}");
    }
};

// Timer'ın başladığını logla
Console.WriteLine($"[Timer] Scheduled group timer started. Will check every 1 minute. Current time: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");

app.Run();

// Uygulama kapanırken timer'ı durdur
timer.Stop();
timer.Dispose();

