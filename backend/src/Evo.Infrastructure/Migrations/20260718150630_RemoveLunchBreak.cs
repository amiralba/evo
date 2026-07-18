using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveLunchBreak : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "setting",
                keyColumns: new[] { "Key", "RegionId" },
                keyValues: new object[] { "break_blocks", "" },
                column: "ValueJson",
                value: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "setting",
                keyColumns: new[] { "Key", "RegionId" },
                keyValues: new object[] { "break_blocks", "" },
                column: "ValueJson",
                value: "[{\"label\":\"Ogle Yemegi\",\"start\":\"12:30\",\"end\":\"13:15\"}]");
        }
    }
}
