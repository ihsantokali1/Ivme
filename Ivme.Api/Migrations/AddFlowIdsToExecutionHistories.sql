-- Add FlowItemId and FlowItemExecutionId to Execution History Tables

USE [ScoreReportDB]
GO

-- TaskExecutionHistories tablosuna ekle
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'FlowItemId')
BEGIN
    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [FlowItemId] NVARCHAR(50) NULL;
    PRINT '[DB] Added FlowItemId to TaskExecutionHistories';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'FlowItemExecutionId')
BEGIN
    ALTER TABLE [dbo].[TaskExecutionHistories] ADD [FlowItemExecutionId] NVARCHAR(50) NULL;
    PRINT '[DB] Added FlowItemExecutionId to TaskExecutionHistories';
END

-- GroupExecutionHistories tablosuna ekle
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemId')
BEGIN
    ALTER TABLE [dbo].[GroupExecutionHistories] ADD [FlowItemId] NVARCHAR(50) NULL;
    PRINT '[DB] Added FlowItemId to GroupExecutionHistories';
END

-- FlowExecutionId kolonunu FlowItemExecutionId olarak güncelle (eğer FlowExecutionId varsa)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowExecutionId')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemExecutionId')
BEGIN
    EXEC sp_rename 'dbo.GroupExecutionHistories.FlowExecutionId', 'FlowItemExecutionId', 'COLUMN';
    PRINT '[DB] Renamed FlowExecutionId to FlowItemExecutionId in GroupExecutionHistory';
END
ELSE IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemExecutionId')
BEGIN
    ALTER TABLE [dbo].[GroupExecutionHistories] ADD [FlowItemExecutionId] NVARCHAR(50) NULL;
    PRINT '[DB] Added FlowItemExecutionId to GroupExecutionHistories';
END
GO
