using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Chains",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Chains", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StoreFlags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<byte>(type: "tinyint", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    StartsOn = table.Column<DateOnly>(type: "date", nullable: false),
                    EndsOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreFlags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StoreRevenues",
                columns: table => new
                {
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Month = table.Column<DateOnly>(type: "date", nullable: false),
                    Revenue = table.Column<decimal>(type: "decimal(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreRevenues", x => new { x.StoreId, x.Month });
                });

            migrationBuilder.CreateTable(
                name: "StoreTypes",
                columns: table => new
                {
                    Code = table.Column<byte>(type: "tinyint", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoreTypes", x => x.Code);
                });

            migrationBuilder.CreateTable(
                name: "Stores",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvoStoreId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ChainId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Channel = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Province = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    District = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Neighborhood = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    Location = table.Column<Point>(type: "geography", nullable: true),
                    Category = table.Column<byte>(type: "tinyint", nullable: false),
                    Format = table.Column<byte>(type: "tinyint", nullable: false),
                    DefaultServiceMinutes = table.Column<int>(type: "int", nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    AttributesJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SyncedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Stores", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Stores_Chains_ChainId",
                        column: x => x.ChainId,
                        principalTable: "Chains",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Stores_StoreTypes_Format",
                        column: x => x.Format,
                        principalTable: "StoreTypes",
                        principalColumn: "Code");
                });

            migrationBuilder.InsertData(
                table: "StoreTypes",
                columns: new[] { "Code", "Label" },
                values: new object[,]
                {
                    { (byte)1, "Jet" },
                    { (byte)2, "M" },
                    { (byte)3, "MM" },
                    { (byte)4, "3M" },
                    { (byte)5, "4M" },
                    { (byte)6, "5M" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Chains_Name",
                table: "Chains",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoreFlags_StoreId",
                table: "StoreFlags",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_Stores_ChainId",
                table: "Stores",
                column: "ChainId");

            migrationBuilder.CreateIndex(
                name: "IX_Stores_EvoStoreId",
                table: "Stores",
                column: "EvoStoreId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Stores_Format",
                table: "Stores",
                column: "Format");

            migrationBuilder.CreateIndex(
                name: "IX_Stores_Province_District",
                table: "Stores",
                columns: new[] { "Province", "District" });

            migrationBuilder.Sql("CREATE SPATIAL INDEX IX_Stores_Location ON Stores(Location);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IX_Stores_Location ON Stores;");

            migrationBuilder.DropTable(
                name: "StoreFlags");

            migrationBuilder.DropTable(
                name: "StoreRevenues");

            migrationBuilder.DropTable(
                name: "Stores");

            migrationBuilder.DropTable(
                name: "Chains");

            migrationBuilder.DropTable(
                name: "StoreTypes");
        }
    }
}
