-- TaskExecutionHistories tablosundaki NULL TaskParameterValues değerlerini düzelt
-- Bu script'i SQL Server Management Studio'da çalıştırabilirsiniz

USE [ScoreReportDB]
GO

-- Mevcut NULL değerleri boş JSON objesi ile güncelle (Entity Framework sorununu önlemek için)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND type in (N'U'))
BEGIN
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TaskExecutionHistories]') AND name = 'TaskParameterValues')
    BEGIN
        -- NULL değerleri boş JSON objesi ile güncelle
        UPDATE [dbo].[TaskExecutionHistories] 
        SET [TaskParameterValues] = '{}' 
        WHERE [TaskParameterValues] IS NULL;
        
        DECLARE @UpdatedCount INT;
        SET @UpdatedCount = @@ROWCOUNT;
        
        IF @UpdatedCount > 0
        BEGIN
            PRINT '[DB] Updated ' + CAST(@UpdatedCount AS VARCHAR(10)) + ' NULL TaskParameterValues to empty JSON object';
        END
        ELSE
        BEGIN
            PRINT '[DB] No NULL TaskParameterValues found to update';
        END
    END
    ELSE
    BEGIN
        PRINT '[DB] TaskParameterValues column does not exist in TaskExecutionHistories table';
    END
END
ELSE
BEGIN
    PRINT '[DB] TaskExecutionHistories table does not exist';
END
GO

