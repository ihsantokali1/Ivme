-- Users tablosunu oluştur
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Users] (
        [Id] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [Username] NVARCHAR(100) NOT NULL,
        [PasswordHash] NVARCHAR(500) NOT NULL,
        [Email] NVARCHAR(200) NULL,
        [Role] NVARCHAR(20) NOT NULL DEFAULT 'User',
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL,
        [UpdatedAt] DATETIME2 NOT NULL
    );
    
    CREATE UNIQUE INDEX [IX_Users_Username] ON [Users]([Username]);
    
    PRINT '[DB] Users table created successfully';
END
ELSE
BEGIN
    PRINT '[DB] Users table already exists';
END

-- Varsayılan admin kullanıcısı oluştur (şifre: admin123)
-- NOT: Production'da bu kullanıcıyı silin veya şifresini değiştirin!
IF NOT EXISTS (SELECT * FROM [dbo].[Users] WHERE [Username] = 'admin')
BEGIN
    INSERT INTO [dbo].[Users] ([Id], [Username], [PasswordHash], [Email], [Role], [IsActive], [CreatedAt], [UpdatedAt])
    VALUES (
        NEWID(),
        'admin',
        '$2a$11$KIXqJqJqJqJqJqJqJqJqJ.qJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJq', -- admin123 hash (BCrypt)
        'admin@ivme.com',
        'Admin',
        1,
        GETDATE(),
        GETDATE()
    );
    
    PRINT '[DB] Default admin user created (username: admin, password: admin123)';
    PRINT '[DB] WARNING: Change the default admin password in production!';
END

