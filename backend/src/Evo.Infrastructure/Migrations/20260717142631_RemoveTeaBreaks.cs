using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveTeaBreaks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "setting",
                keyColumns: new[] { "Key", "RegionId" },
                keyValues: new object[] { "break_blocks", "" },
                column: "ValueJson",
                value: "[{\"label\":\"Ogle Yemegi\",\"start\":\"12:30\",\"end\":\"13:15\"}]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "setting",
                keyColumns: new[] { "Key", "RegionId" },
                keyValues: new object[] { "break_blocks", "" },
                column: "ValueJson",
                value: "[{\"label\":\"Kahvalti\",\"start\":\"10:30\",\"end\":\"10:45\"},{\"label\":\"Ogle Yemegi\",\"start\":\"12:30\",\"end\":\"13:15\"},{\"label\":\"Ikindi Cayi\",\"start\":\"15:30\",\"end\":\"15:45\"}]");
        }
    }
}
