using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Ivme.Api.Models;

namespace Ivme.Api.Data;

public class TaskDbContext : DbContext
{
    public TaskDbContext(DbContextOptions<TaskDbContext> options) : base(options)
    {
    }

    public DbSet<TaskItemGroup> Groups { get; set; }
    public DbSet<TaskItem> TaskItems { get; set; }
    public DbSet<TaskParameter> TaskParameters { get; set; }
    public DbSet<GroupTaskAssignment> GroupTaskAssignments { get; set; }
    public DbSet<GroupSchedule> GroupSchedules { get; set; }
    public DbSet<TaskExecutionHistory> TaskExecutionHistories { get; set; }
    public DbSet<GroupExecutionHistory> GroupExecutionHistories { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<RolePermission> RolePermissions { get; set; }
    public DbSet<Role> Roles { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // TaskItemGroup
        modelBuilder.Entity<TaskItemGroup>(entity =>
        {
            entity.ToTable("TaskItemGroups");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(1000);
        });

        // TaskItem
        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.ToTable("TaskItems");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.ErrorMessage).HasMaxLength(2000);
            entity.Property(e => e.SourceType)
                .HasConversion<string>()
                .HasMaxLength(20)
                .HasDefaultValue(TaskSourceType.Manual); // Eski kayıtlar için default değer
            entity.Property(e => e.StoredProcedureName).HasMaxLength(200);
            entity.Property(e => e.StoredProcedureSchema).HasMaxLength(50);
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true); // Eski kayıtlar için default değer
            
            // Parameters navigation property
            entity.HasMany(e => e.Parameters)
                .WithOne()
                .HasForeignKey("TaskItemId")
                .OnDelete(DeleteBehavior.Cascade);
        });
        
        // TaskParameter
        modelBuilder.Entity<TaskParameter>(entity =>
        {
            entity.ToTable("TaskParameters");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.TaskItemId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.ParameterName).HasMaxLength(100).IsRequired();
            entity.Property(e => e.ParameterType).HasMaxLength(50).IsRequired();
            entity.Property(e => e.DefaultValue).HasMaxLength(500);
            entity.Property(e => e.Description).HasMaxLength(1000);
            
            entity.HasIndex(e => e.TaskItemId);
            entity.HasIndex(e => new { e.TaskItemId, e.ParameterName }).IsUnique();
        });

        // GroupTaskAssignment
        modelBuilder.Entity<GroupTaskAssignment>(entity =>
        {
            entity.ToTable("GroupTaskAssignments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.GroupId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.TaskItemId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.ErrorMessage).HasMaxLength(2000);
            
            // PrerequisiteTaskItemIds'i JSON olarak sakla
            var jsonOptions = new System.Text.Json.JsonSerializerOptions();
            entity.Property(e => e.PrerequisiteTaskItemIds)
                .HasConversion(
                    v => System.Text.Json.JsonSerializer.Serialize(v, jsonOptions),
                    v => System.Text.Json.JsonSerializer.Deserialize<List<string>>(v, jsonOptions) ?? new List<string>(),
                    new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
                        (c1, c2) => c1 != null && c2 != null && c1.SequenceEqual(c2),
                        c => c != null ? c.Aggregate(0, (a, v) => HashCode.Combine(a, v != null ? v.GetHashCode() : 0)) : 0,
                        c => c != null ? c.ToList() : new List<string>()))
                .HasColumnType("nvarchar(max)");
            
            // TaskParameterValues'i JSON olarak sakla
            entity.Property(e => e.TaskParameterValues)
                .HasConversion(
                    v => System.Text.Json.JsonSerializer.Serialize(v, jsonOptions),
                    v => System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string?>>(v, jsonOptions) ?? new Dictionary<string, string?>(),
                    new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<Dictionary<string, string?>>(
                        (c1, c2) => c1 != null && c2 != null && c1.Count == c2.Count && !c1.Except(c2).Any(),
                        c => c != null ? c.Aggregate(0, (a, kvp) => HashCode.Combine(a, kvp.Key != null ? kvp.Key.GetHashCode() : 0, kvp.Value != null ? kvp.Value.GetHashCode() : 0)) : 0,
                        c => c != null ? new Dictionary<string, string?>(c) : new Dictionary<string, string?>()))
                .HasColumnType("nvarchar(max)");
            
            entity.HasIndex(e => new { e.GroupId, e.TaskItemId }).IsUnique();
        });

        // GroupSchedule
        modelBuilder.Entity<GroupSchedule>(entity =>
        {
            entity.ToTable("GroupSchedules");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.GroupId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.WorkPeriod).HasConversion<string>().HasMaxLength(20);
            
            entity.HasIndex(e => e.GroupId).IsUnique();
        });

        // TaskExecutionHistory
        modelBuilder.Entity<TaskExecutionHistory>(entity =>
        {
            entity.ToTable("TaskExecutionHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.TaskItemId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.GroupId).HasMaxLength(50);
            entity.Property(e => e.GroupExecutionId).HasMaxLength(50);
            entity.Property(e => e.FinalStatus).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.ErrorMessage).HasMaxLength(2000);
            
            // TaskParameterValues'i JSON olarak sakla
            var jsonOptions = new System.Text.Json.JsonSerializerOptions();
            entity.Property(e => e.TaskParameterValues)
                .HasConversion(
                    v => v == null || v.Count == 0 ? (string?)null : System.Text.Json.JsonSerializer.Serialize(v, jsonOptions),
                    v => v == null || string.IsNullOrWhiteSpace(v) ? new Dictionary<string, string?>() : (System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string?>>(v, jsonOptions) ?? new Dictionary<string, string?>()),
                    new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<Dictionary<string, string?>>(
                        (c1, c2) => (c1 == null && c2 == null) || (c1 != null && c2 != null && c1.Count == c2.Count && !c1.Except(c2).Any()),
                        c => c != null ? c.Aggregate(0, (a, kvp) => HashCode.Combine(a, kvp.Key != null ? kvp.Key.GetHashCode() : 0, kvp.Value != null ? kvp.Value.GetHashCode() : 0)) : 0,
                        c => c != null ? new Dictionary<string, string?>(c) : new Dictionary<string, string?>()),
                    new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<string?>(
                        (c1, c2) => c1 == c2,
                        c => c != null ? c.GetHashCode() : 0,
                        c => c))
                .HasColumnType("nvarchar(max)")
                .IsRequired(false);
            
            entity.Property(e => e.TriggeredBy).HasMaxLength(50);
            
            entity.HasIndex(e => e.TaskItemId);
            entity.HasIndex(e => e.GroupId);
            entity.HasIndex(e => e.GroupExecutionId);
            entity.HasIndex(e => e.StartTime);
        });

        // GroupExecutionHistory
        modelBuilder.Entity<GroupExecutionHistory>(entity =>
        {
            entity.ToTable("GroupExecutionHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.GroupId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.TriggeredBy).HasMaxLength(50);
            entity.HasIndex(e => e.GroupId);
            entity.HasIndex(e => e.StartTime);
        });

        // User
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.Username).HasMaxLength(100).IsRequired();
            entity.Property(e => e.PasswordHash).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Email).HasMaxLength(200);
            entity.Property(e => e.Role).HasMaxLength(50).IsRequired();
            entity.HasIndex(e => e.Username).IsUnique();
        });

        // RolePermission
        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.ToTable("RolePermissions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.Role).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Permission).HasMaxLength(100).IsRequired();
            entity.HasIndex(e => new { e.Role, e.Permission }).IsUnique();
        });

        // Role
        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("Roles");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.HasIndex(e => e.Name).IsUnique();
        });
    }
}

