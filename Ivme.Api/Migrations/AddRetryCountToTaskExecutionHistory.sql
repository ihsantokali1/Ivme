-- Add RetryCount column to TaskExecutionHistories table
-- Bu script'i SQL Server Management Studio'da çalıştırabilirsiniz

USE [ScoreReportDB]
GO

-- TaskExecutionHistories tablosuna RetryCount kolonu ekle
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'RetryCount')
BEGIN
    ALTER TABLE [dbo].[TaskExecutionHistories] 
    ADD [RetryCount] INT NOT NULL DEFAULT 0;
    
    PRINT '[DB] Added RetryCount column to TaskExecutionHistories table';
END
ELSE
BEGIN
    PRINT '[DB] RetryCount column already exists in TaskExecutionHistories table';
END
GO

