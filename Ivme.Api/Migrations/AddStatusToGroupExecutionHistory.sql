IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[GroupExecutionHistories]') AND name = 'Status')
BEGIN
    ALTER TABLE [GroupExecutionHistories] ADD [Status] nvarchar(20) NOT NULL DEFAULT 'Running';
END
GO
