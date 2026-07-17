using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVisitRealizationAndLocationPings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "merchandiser_location_ping",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchandiserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Lat = table.Column<double>(type: "float", nullable: false),
                    Lng = table.Column<double>(type: "float", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_merchandiser_location_ping", x => x.Id);
                    table.ForeignKey(
                        name: "FK_merchandiser_location_ping_merchandiser_MerchandiserId",
                        column: x => x.MerchandiserId,
                        principalTable: "merchandiser",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "visit_realization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlannedVisitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CheckInAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CheckOutAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ActualMinutes = table.Column<int>(type: "int", nullable: true),
                    OutcomeReason = table.Column<byte>(type: "tinyint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_visit_realization", x => x.Id);
                    table.ForeignKey(
                        name: "FK_visit_realization_planned_visit_PlannedVisitId",
                        column: x => x.PlannedVisitId,
                        principalTable: "planned_visit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_merchandiser_location_ping_MerchandiserId_RecordedAt",
                table: "merchandiser_location_ping",
                columns: new[] { "MerchandiserId", "RecordedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_visit_realization_PlannedVisitId",
                table: "visit_realization",
                column: "PlannedVisitId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "merchandiser_location_ping");

            migrationBuilder.DropTable(
                name: "visit_realization");
        }
    }
}
