-- Flow Tables Schema
-- Bu script'i SQL Server Management Studio'da çalıştırabilirsiniz

USE [ScoreReportDB]
GO

-- FlowItems tablosu
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
END
GO

-- FlowGroupAssignments tablosu
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
        [UpdatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [IX_FlowGroupAssignments_FlowItemId_GroupId] UNIQUE ([FlowItemId], [GroupId])
    );
    PRINT '[DB] FlowGroupAssignments table created successfully';
END
ELSE
BEGIN
    PRINT '[DB] FlowGroupAssignments table already exists';
END
GO
