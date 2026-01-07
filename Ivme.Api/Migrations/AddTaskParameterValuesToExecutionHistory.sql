-- TaskExecutionHistories tablosuna TaskParameterValues kolonunu ekle
-- Bu script'i SQL Server Management Studio'da çalıştırabilirsiniz

USE [ScoreReportDB]
GO

-- Mevcut tabloya TaskParameterValues kolonunu ekle (yoksa)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND type in (N'U'))
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'TaskParameterValues')
    BEGIN
        ALTER TABLE [dbo].[TaskExecutionHistories] ADD [TaskParameterValues] NVARCHAR(MAX) NULL;
        PRINT '[DB] Added TaskParameterValues column to TaskExecutionHistories table';
    END
    ELSE
    BEGIN
        PRINT '[DB] TaskParameterValues column already exists in TaskExecutionHistories table';
    END
    
    -- Mevcut NULL değerleri boş JSON objesi ile güncelle (Entity Framework sorununu önlemek için)
    -- ÖNEMLİ: Bu script'i çalıştırmadan önce Entity Framework NULL değerleri okuyamayabilir
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'TaskParameterValues')
    BEGIN
        UPDATE [dbo].[TaskExecutionHistories] 
        SET [TaskParameterValues] = '{}' 
        WHERE [TaskParameterValues] IS NULL;
        PRINT '[DB] Updated NULL TaskParameterValues to empty JSON object';
    END
END
ELSE
BEGIN
    PRINT '[DB] TaskExecutionHistories table does not exist';
END
GO

