using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRouting1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "merchandiser",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HomeLocation = table.Column<Point>(type: "geography", nullable: true),
                    HiredOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_merchandiser", x => x.Id);
                    table.ForeignKey(
                        name: "FK_merchandiser_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "route",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RouteCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Province = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DistrictsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    GeoScope = table.Column<MultiPolygon>(type: "geography", nullable: true),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    RevenueTarget = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    DailyWorkMinutes = table.Column<int>(type: "int", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "route_stop",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RouteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<byte>(type: "tinyint", nullable: false),
                    WeekdayMask = table.Column<short>(type: "smallint", nullable: false),
                    BiweeklyAnchor = table.Column<DateOnly>(type: "date", nullable: true),
                    ServiceMinutes = table.Column<int>(type: "int", nullable: true),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    TimeWindowStart = table.Column<TimeOnly>(type: "time", nullable: true),
                    TimeWindowEnd = table.Column<TimeOnly>(type: "time", nullable: true),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveTo = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_stop", x => x.Id);
                    table.ForeignKey(
                        name: "FK_route_stop_Stores_StoreId",
                        column: x => x.StoreId,
                        principalTable: "Stores",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_route_stop_route_RouteId",
                        column: x => x.RouteId,
                        principalTable: "route",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_merchandiser_UserId",
                table: "merchandiser",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_route_RouteCode",
                table: "route",
                column: "RouteCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_route_stop_RouteId",
                table: "route_stop",
                column: "RouteId");

            migrationBuilder.CreateIndex(
                name: "IX_route_stop_StoreId",
                table: "route_stop",
                column: "StoreId",
                unique: true,
                filter: "[EffectiveTo] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "merchandiser");

            migrationBuilder.DropTable(
                name: "route_stop");

            migrationBuilder.DropTable(
                name: "route");
        }
    }
}
