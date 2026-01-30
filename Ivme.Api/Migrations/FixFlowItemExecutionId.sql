-- SQL Script to fix FlowItemExecutionId column type and index
-- Run this in SQL Server Management Studio

USE [ScoreReportDB]
GO

BEGIN TRANSACTION;

-- 1. Drop the index if it exists (it might not exist if creation failed)
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GroupExecutionHistories_FlowItemExecutionId' AND object_id = OBJECT_ID('GroupExecutionHistories'))
BEGIN
    DROP INDEX [IX_GroupExecutionHistories_FlowItemExecutionId] ON [GroupExecutionHistories];
    PRINT '[DB] Dropped index IX_GroupExecutionHistories_FlowItemExecutionId';
END

-- 2. Alter the column type to NVARCHAR(50)
-- Check if column exists first
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[GroupExecutionHistories]') AND name = 'FlowItemExecutionId')
BEGIN
    ALTER TABLE [dbo].[GroupExecutionHistories] ALTER COLUMN [FlowItemExecutionId] NVARCHAR(50) NULL;
    PRINT '[DB] Altered column FlowItemExecutionId to NVARCHAR(50) in GroupExecutionHistories';
END

-- 3. Create the index
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GroupExecutionHistories_FlowItemExecutionId' AND object_id = OBJECT_ID('GroupExecutionHistories'))
BEGIN
    CREATE INDEX [IX_GroupExecutionHistories_FlowItemExecutionId] ON [GroupExecutionHistories]([FlowItemExecutionId]);
    PRINT '[DB] Created index IX_GroupExecutionHistories_FlowItemExecutionId';
END

COMMIT TRANSACTION;
GO
