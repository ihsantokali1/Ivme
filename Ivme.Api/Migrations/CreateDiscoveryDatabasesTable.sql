-- Add StoredProcedureDatabase to TaskItems table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'StoredProcedureDatabase')
BEGIN
    ALTER TABLE [dbo].[TaskItems] ADD [StoredProcedureDatabase] NVARCHAR(100) NULL;
END

-- Create DiscoveryDatabases table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DiscoveryDatabases]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[DiscoveryDatabases] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [DatabaseName] NVARCHAR(100) NOT NULL,
        [IsSelected] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE UNIQUE INDEX [IX_DiscoveryDatabases_DatabaseName] ON [dbo].[DiscoveryDatabases] ([DatabaseName]);
END
GO
