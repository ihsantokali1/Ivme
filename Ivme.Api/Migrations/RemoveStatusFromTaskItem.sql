-- TaskItems tablosundan Status kolonunu kaldır
-- Bu script'i SQL Server Management Studio'da çalıştırabilirsiniz

USE [ScoreReportDB]
GO

-- Mevcut tabloda Status kolonunu kaldır (varsa)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND type in (N'U'))
BEGIN
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskItems]') AND name = 'Status')
    BEGIN
        ALTER TABLE [dbo].[TaskItems] DROP COLUMN [Status];
        PRINT '[DB] Removed Status column from TaskItems table';
    END
    ELSE
    BEGIN
        PRINT '[DB] Status column does not exist in TaskItems table';
    END
END
ELSE
BEGIN
    PRINT '[DB] TaskItems table does not exist';
END
GO

