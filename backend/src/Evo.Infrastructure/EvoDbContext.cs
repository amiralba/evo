using Microsoft.EntityFrameworkCore;

namespace Evo.Infrastructure;

public class EvoDbContext : DbContext
{
    public EvoDbContext(DbContextOptions<EvoDbContext> options) : base(options)
    {
    }
}
