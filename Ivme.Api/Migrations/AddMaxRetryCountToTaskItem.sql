IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'MaxRetryCount')
BEGIN
    ALTER TABLE [dbo].[TaskItems] ADD [MaxRetryCount] [int] NOT NULL DEFAULT 3;
END
GO
