using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRouting2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "assignment",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RouteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchandiserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Reason = table.Column<byte>(type: "tinyint", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assignment_merchandiser_MerchandiserId",
                        column: x => x.MerchandiserId,
                        principalTable: "merchandiser",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_assignment_route_RouteId",
                        column: x => x.RouteId,
                        principalTable: "route",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "decision_journal",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<byte>(type: "tinyint", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Objective = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ErrorsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AuthorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_decision_journal", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "patch",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RouteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<byte>(type: "tinyint", nullable: false),
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CoverMerchandiserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StartsOn = table.Column<DateOnly>(type: "date", nullable: false),
                    EndsOn = table.Column<DateOnly>(type: "date", nullable: false),
                    ParamsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patch", x => x.Id);
                    table.ForeignKey(
                        name: "FK_patch_route_RouteId",
                        column: x => x.RouteId,
                        principalTable: "route",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "planned_visit",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RouteId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RouteStopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchandiserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    VisitDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PlannedStart = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PlannedEnd = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Source = table.Column<byte>(type: "tinyint", nullable: false),
                    PatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<byte>(type: "tinyint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_planned_visit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_planned_visit_route_RouteId",
                        column: x => x.RouteId,
                        principalTable: "route",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "setting",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RegionId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ValueJson = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_setting", x => new { x.Key, x.RegionId });
                });

            migrationBuilder.InsertData(
                table: "setting",
                columns: new[] { "Key", "RegionId", "ValueJson" },
                values: new object[,]
                {
                    { "break_blocks", "", "[{\"label\":\"Kahvalti\",\"start\":\"10:30\",\"end\":\"10:45\"},{\"label\":\"Ogle Yemegi\",\"start\":\"12:30\",\"end\":\"13:15\"},{\"label\":\"Ikindi Cayi\",\"start\":\"15:30\",\"end\":\"15:45\"}]" },
                    { "daily_work_minutes", "", "450" },
                    { "day_start", "", "\"09:00\"" },
                    { "default_service_minutes", "", "30" },
                    { "over_450_tolerance_minutes", "", "0" },
                    { "plan_horizon_weeks", "", "6" },
                    { "service_mix_cap_pct", "", "20" },
                    { "snap_minutes", "", "5" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_assignment_MerchandiserId",
                table: "assignment",
                column: "MerchandiserId",
                unique: true,
                filter: "[EndDate] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_assignment_RouteId",
                table: "assignment",
                column: "RouteId",
                unique: true,
                filter: "[EndDate] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_patch_RouteId_Status_EndsOn",
                table: "patch",
                columns: new[] { "RouteId", "Status", "EndsOn" });

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_MerchandiserId_VisitDate",
                table: "planned_visit",
                columns: new[] { "MerchandiserId", "VisitDate" });

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_RouteId",
                table: "planned_visit",
                column: "RouteId");

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_RouteStopId_VisitDate",
                table: "planned_visit",
                columns: new[] { "RouteStopId", "VisitDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assignment");

            migrationBuilder.DropTable(
                name: "decision_journal");

            migrationBuilder.DropTable(
                name: "patch");

            migrationBuilder.DropTable(
                name: "planned_visit");

            migrationBuilder.DropTable(
                name: "setting");
        }
    }
}
