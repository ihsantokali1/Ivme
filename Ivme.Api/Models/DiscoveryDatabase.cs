namespace Ivme.Api.Models;

public class DiscoveryDatabase
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string DatabaseName { get; set; } = string.Empty;
    public bool IsSelected { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
