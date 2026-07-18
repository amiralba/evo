using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUtilizationBandSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "setting",
                columns: new[] { "Key", "RegionId", "ValueJson" },
                values: new object[,]
                {
                    { "utilization_band_lower", "", "0.90" },
                    { "utilization_band_upper", "", "1.05" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "setting",
                keyColumns: new[] { "Key", "RegionId" },
                keyValues: new object[] { "utilization_band_lower", "" });

            migrationBuilder.DeleteData(
                table: "setting",
                keyColumns: new[] { "Key", "RegionId" },
                keyValues: new object[] { "utilization_band_upper", "" });
        }
    }
}
