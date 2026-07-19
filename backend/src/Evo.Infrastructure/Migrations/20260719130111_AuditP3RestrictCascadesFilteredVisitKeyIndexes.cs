using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AuditP3RestrictCascadesFilteredVisitKeyIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_absence_merchandiser_MerchandiserId",
                table: "absence");

            migrationBuilder.DropForeignKey(
                name: "FK_merchandiser_location_ping_merchandiser_MerchandiserId",
                table: "merchandiser_location_ping");

            migrationBuilder.DropForeignKey(
                name: "FK_patch_route_RouteId",
                table: "patch");

            migrationBuilder.DropForeignKey(
                name: "FK_planned_visit_route_RouteId",
                table: "planned_visit");

            migrationBuilder.DropForeignKey(
                name: "FK_route_stop_route_RouteId",
                table: "route_stop");

            migrationBuilder.DropForeignKey(
                name: "FK_visit_realization_planned_visit_PlannedVisitId",
                table: "visit_realization");

            migrationBuilder.DropIndex(
                name: "IX_planned_visit_RouteId",
                table: "planned_visit");

            migrationBuilder.DropIndex(
                name: "IX_planned_visit_RouteStopId_VisitDate",
                table: "planned_visit");

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_RouteId_VisitDate",
                table: "planned_visit",
                columns: new[] { "RouteId", "VisitDate" });

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_RouteStopId_VisitDate",
                table: "planned_visit",
                columns: new[] { "RouteStopId", "VisitDate" },
                unique: true,
                filter: "[RouteStopId] <> '00000000-0000-0000-0000-000000000000'");

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_StoreId_VisitDate",
                table: "planned_visit",
                columns: new[] { "StoreId", "VisitDate" });

            migrationBuilder.AddForeignKey(
                name: "FK_absence_merchandiser_MerchandiserId",
                table: "absence",
                column: "MerchandiserId",
                principalTable: "merchandiser",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_merchandiser_location_ping_merchandiser_MerchandiserId",
                table: "merchandiser_location_ping",
                column: "MerchandiserId",
                principalTable: "merchandiser",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_patch_route_RouteId",
                table: "patch",
                column: "RouteId",
                principalTable: "route",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_planned_visit_route_RouteId",
                table: "planned_visit",
                column: "RouteId",
                principalTable: "route",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_route_stop_route_RouteId",
                table: "route_stop",
                column: "RouteId",
                principalTable: "route",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_visit_realization_planned_visit_PlannedVisitId",
                table: "visit_realization",
                column: "PlannedVisitId",
                principalTable: "planned_visit",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_absence_merchandiser_MerchandiserId",
                table: "absence");

            migrationBuilder.DropForeignKey(
                name: "FK_merchandiser_location_ping_merchandiser_MerchandiserId",
                table: "merchandiser_location_ping");

            migrationBuilder.DropForeignKey(
                name: "FK_patch_route_RouteId",
                table: "patch");

            migrationBuilder.DropForeignKey(
                name: "FK_planned_visit_route_RouteId",
                table: "planned_visit");

            migrationBuilder.DropForeignKey(
                name: "FK_route_stop_route_RouteId",
                table: "route_stop");

            migrationBuilder.DropForeignKey(
                name: "FK_visit_realization_planned_visit_PlannedVisitId",
                table: "visit_realization");

            migrationBuilder.DropIndex(
                name: "IX_planned_visit_RouteId_VisitDate",
                table: "planned_visit");

            migrationBuilder.DropIndex(
                name: "IX_planned_visit_RouteStopId_VisitDate",
                table: "planned_visit");

            migrationBuilder.DropIndex(
                name: "IX_planned_visit_StoreId_VisitDate",
                table: "planned_visit");

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_RouteId",
                table: "planned_visit",
                column: "RouteId");

            migrationBuilder.CreateIndex(
                name: "IX_planned_visit_RouteStopId_VisitDate",
                table: "planned_visit",
                columns: new[] { "RouteStopId", "VisitDate" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_absence_merchandiser_MerchandiserId",
                table: "absence",
                column: "MerchandiserId",
                principalTable: "merchandiser",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_merchandiser_location_ping_merchandiser_MerchandiserId",
                table: "merchandiser_location_ping",
                column: "MerchandiserId",
                principalTable: "merchandiser",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_patch_route_RouteId",
                table: "patch",
                column: "RouteId",
                principalTable: "route",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_planned_visit_route_RouteId",
                table: "planned_visit",
                column: "RouteId",
                principalTable: "route",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_route_stop_route_RouteId",
                table: "route_stop",
                column: "RouteId",
                principalTable: "route",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_visit_realization_planned_visit_PlannedVisitId",
                table: "visit_realization",
                column: "PlannedVisitId",
                principalTable: "planned_visit",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
