-- RolePermissions tablosunu oluştur
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RolePermissions]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[RolePermissions] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [Role] NVARCHAR(20) NOT NULL,
        [Permission] NVARCHAR(100) NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL,
        [UpdatedAt] DATETIME2 NOT NULL
    );
    
    CREATE UNIQUE INDEX [IX_RolePermissions_Role_Permission] ON [RolePermissions]([Role], [Permission]);
    
    PRINT '[DB] RolePermissions table created successfully';
END
ELSE
BEGIN
    PRINT '[DB] RolePermissions table already exists';
END

-- Varsayılan Admin yetkileri
IF NOT EXISTS (SELECT * FROM [dbo].[RolePermissions] WHERE [Role] = 'Admin')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Id], [Role], [Permission], [CreatedAt], [UpdatedAt])
    VALUES
        (NEWID(), 'Admin', 'pages.tasks.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.tasks.create', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.tasks.update', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.tasks.delete', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.groups.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.groups.create', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.groups.update', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.groups.delete', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.configuration.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.configuration.update', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.schedule.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.schedule.update', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.management.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.history.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.tv.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.users.view', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.users.create', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.users.update', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'pages.users.delete', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.start', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.stop', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.pause', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.resume', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.complete', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.markAsSuccess', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.fail', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.task.restart', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.group.start', GETDATE(), GETDATE()),
        (NEWID(), 'Admin', 'actions.group.stop', GETDATE(), GETDATE());
    
    PRINT '[DB] Default Admin permissions created';
END

-- Varsayılan User yetkileri
IF NOT EXISTS (SELECT * FROM [dbo].[RolePermissions] WHERE [Role] = 'User')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Id], [Role], [Permission], [CreatedAt], [UpdatedAt])
    VALUES
        (NEWID(), 'User', 'pages.tasks.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'pages.groups.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'pages.configuration.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'pages.schedule.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'pages.management.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'pages.history.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'pages.tv.view', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.start', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.stop', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.pause', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.resume', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.complete', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.markAsSuccess', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.fail', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.task.restart', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.group.start', GETDATE(), GETDATE()),
        (NEWID(), 'User', 'actions.group.stop', GETDATE(), GETDATE());
    
    PRINT '[DB] Default User permissions created';
END

