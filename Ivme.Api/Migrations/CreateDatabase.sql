-- Task Management Tables Schema
-- Bu script'i SQL Server Management Studio'da çalıştırabilirsiniz
-- ScoreReportDB veritabanı içine tabloları oluşturur

USE [ScoreReportDB]
GO

-- TaskItemGroups tablosu
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskItemGroups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TaskItemGroups] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(1000) NULL,
        [CreatedAt] DATETIME2 NOT NULL,
        [UpdatedAt] DATETIME2 NOT NULL
    );
END
GO

-- TaskItems tablosu
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TaskItems] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(1000) NULL,
        [RetryIntervalMinutes] INT NOT NULL DEFAULT 60,
        [StartTime] DATETIME2 NULL,
        [EndTime] DATETIME2 NULL,
        [LastErrorTime] DATETIME2 NULL,
        [RetryDelayMinutes] INT NOT NULL DEFAULT 60,
        [Progress] INT NOT NULL DEFAULT 0,
        [ErrorMessage] NVARCHAR(2000) NULL,
        [CreatedAt] DATETIME2 NOT NULL,
        [UpdatedAt] DATETIME2 NOT NULL,
        [SourceType] NVARCHAR(20) NOT NULL DEFAULT 'Manual',
        [StoredProcedureName] NVARCHAR(200) NULL,
        [StoredProcedureSchema] NVARCHAR(50) NULL,
        [LastDiscoveredAt] DATETIME2 NULL,
        [IsActive] BIT NOT NULL DEFAULT 1
    );
END
ELSE
BEGIN
    -- Yeni kolonları ekle (eğer yoksa)
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'SourceType')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] ADD [SourceType] NVARCHAR(20) NOT NULL DEFAULT 'Manual';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'StoredProcedureName')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] ADD [StoredProcedureName] NVARCHAR(200) NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'StoredProcedureSchema')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] ADD [StoredProcedureSchema] NVARCHAR(50) NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'LastDiscoveredAt')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] ADD [LastDiscoveredAt] DATETIME2 NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'IsActive')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] ADD [IsActive] BIT NULL;
        -- Mevcut kayıtlar için default değer ata
        UPDATE [dbo].[TaskItems] SET [IsActive] = 1 WHERE [IsActive] IS NULL;
        -- Artık NOT NULL yap (yeni kayıtlar için)
        ALTER TABLE [dbo].[TaskItems] ALTER COLUMN [IsActive] BIT NOT NULL;
        ALTER TABLE [dbo].[TaskItems] ADD CONSTRAINT [DF_TaskItems_IsActive] DEFAULT 1 FOR [IsActive];
    END
    
    -- Status kolonunu kaldır (artık TaskExecutionHistory'den alınıyor)
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'Status')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] DROP COLUMN [Status];
        PRINT '[DB] Removed Status column from TaskItems table';
    END
END
GO

-- TaskParameters tablosu
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
END
GO

-- GroupTaskAssignments tablosu
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[GroupTaskAssignments] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [GroupId] NVARCHAR(50) NOT NULL,
        [TaskItemId] NVARCHAR(50) NOT NULL,
        [Order] INT NOT NULL DEFAULT 0,
        [PrerequisiteTaskItemIds] NVARCHAR(MAX) NULL, -- JSON formatında
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        [StartTime] DATETIME2 NULL,
        [EndTime] DATETIME2 NULL,
        [LastErrorTime] DATETIME2 NULL,
        [Progress] INT NOT NULL DEFAULT 0,
        [ErrorMessage] NVARCHAR(2000) NULL,
        [CreatedAt] DATETIME2 NOT NULL,
        [UpdatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [IX_GroupTaskAssignments_GroupId_TaskItemId] UNIQUE ([GroupId], [TaskItemId])
    );
END
ELSE
BEGIN
    -- Mevcut tabloya yeni kolonları ekle (eğer yoksa)
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'Status')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'StartTime')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [StartTime] DATETIME2 NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'EndTime')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [EndTime] DATETIME2 NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'LastErrorTime')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [LastErrorTime] DATETIME2 NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'Progress')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [Progress] INT NOT NULL DEFAULT 0;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'ErrorMessage')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [ErrorMessage] NVARCHAR(2000) NULL;
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupTaskAssignments]') AND name = 'TaskParameterValues')
    BEGIN
        ALTER TABLE [dbo].[GroupTaskAssignments] ADD [TaskParameterValues] NVARCHAR(MAX) NULL;
    END
END
GO

-- GroupSchedules tablosu
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroupSchedules]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[GroupSchedules] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [GroupId] NVARCHAR(50) NOT NULL,
        [WorkPeriod] NVARCHAR(20) NOT NULL,
        [StartTime] TIME NOT NULL,
        [RestartOnError] BIT NOT NULL DEFAULT 0,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [LastRunTime] DATETIME2 NULL,
        [CreatedAt] DATETIME2 NOT NULL,
        [UpdatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [IX_GroupSchedules_GroupId] UNIQUE ([GroupId])
    );
END
GO

-- Index'ler
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GroupTaskAssignments_GroupId_TaskItemId' AND object_id = OBJECT_ID('GroupTaskAssignments'))
BEGIN
    CREATE UNIQUE INDEX [IX_GroupTaskAssignments_GroupId_TaskItemId] ON [GroupTaskAssignments]([GroupId], [TaskItemId]);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GroupSchedules_GroupId' AND object_id = OBJECT_ID('GroupSchedules'))
BEGIN
    CREATE UNIQUE INDEX [IX_GroupSchedules_GroupId] ON [GroupSchedules]([GroupId]);
END
GO

-- TaskExecutionHistories tablosu
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
        [Progress] INT NOT NULL DEFAULT 0,
        [TaskParameterValues] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIME2 NOT NULL
    );
    
    CREATE INDEX [IX_TaskExecutionHistories_TaskItemId] ON [TaskExecutionHistories]([TaskItemId]);
    CREATE INDEX [IX_TaskExecutionHistories_GroupId] ON [TaskExecutionHistories]([GroupId]);
    CREATE INDEX [IX_TaskExecutionHistories_GroupExecutionId] ON [TaskExecutionHistories]([GroupExecutionId]);
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
END
GO

-- GroupExecutionHistories tablosu
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
        [TriggeredBy] NVARCHAR(50) NULL,
        [CreatedAt] DATETIME2 NOT NULL
    );
    
    CREATE INDEX [IX_GroupExecutionHistories_GroupId] ON [GroupExecutionHistories]([GroupId]);
    CREATE INDEX [IX_GroupExecutionHistories_StartTime] ON [GroupExecutionHistories]([StartTime]);
END
GO

-- Mevcut TaskParameters tablosuna IsNullable kolonunu ekle (eğer yoksa)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskParameters]') AND type in (N'U'))
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskParameters]') AND name = 'IsNullable')
    BEGIN
        ALTER TABLE [dbo].[TaskParameters]
        ADD [IsNullable] BIT NOT NULL DEFAULT 1;
        PRINT '[DB] Added IsNullable column to TaskParameters table';
    END
END
GO

