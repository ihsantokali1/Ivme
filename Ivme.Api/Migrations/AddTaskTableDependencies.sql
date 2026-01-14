-- Create TaskTableDependencies table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskTableDependencies]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TaskTableDependencies] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [TaskItemId] NVARCHAR(50) NOT NULL,
        [DatabaseName] NVARCHAR(100) NOT NULL,
        [SchemaName] NVARCHAR(50) NOT NULL,
        [ProcedureName] NVARCHAR(200) NOT NULL,
        [TableName] NVARCHAR(200) NOT NULL,
        [UsageType] NVARCHAR(100) NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX [IX_TaskTableDependencies_TaskItemId] ON [dbo].[TaskTableDependencies] ([TaskItemId]);
    CREATE INDEX [IX_TaskTableDependencies_TableName] ON [dbo].[TaskTableDependencies] ([TableName]);
END
GO
