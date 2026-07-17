using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTasksRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "task_template",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DefaultMinutes = table.Column<int>(type: "int", nullable: false),
                    Recurrence = table.Column<int>(type: "int", nullable: false),
                    ProofRequired = table.Column<int>(type: "int", nullable: false),
                    InstructionsText = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ModulesJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DefaultDeadlinePolicy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    TargetChain = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TargetFormat = table.Column<byte>(type: "tinyint", nullable: true),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_template", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "rule",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskTemplateId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Scope = table.Column<int>(type: "int", nullable: false),
                    ConditionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EffectJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveTo = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rule", x => x.Id);
                    table.ForeignKey(
                        name: "FK_rule_task_template_TaskTemplateId",
                        column: x => x.TaskTemplateId,
                        principalTable: "task_template",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "task_instance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlannedVisitId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StoreId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchandiserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TaskTemplateId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ResolvedMinutes = table.Column<int>(type: "int", nullable: false),
                    OverrideMinutes = table.Column<int>(type: "int", nullable: true),
                    OverrideScope = table.Column<int>(type: "int", nullable: true),
                    Deadline = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CancelReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ResultJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_instance", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_instance_planned_visit_PlannedVisitId",
                        column: x => x.PlannedVisitId,
                        principalTable: "planned_visit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_task_instance_task_template_TaskTemplateId",
                        column: x => x.TaskTemplateId,
                        principalTable: "task_template",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_rule_Scope",
                table: "rule",
                column: "Scope");

            migrationBuilder.CreateIndex(
                name: "IX_rule_TaskTemplateId_EffectiveFrom_EffectiveTo",
                table: "rule",
                columns: new[] { "TaskTemplateId", "EffectiveFrom", "EffectiveTo" });

            migrationBuilder.CreateIndex(
                name: "IX_task_instance_PlannedVisitId",
                table: "task_instance",
                column: "PlannedVisitId");

            migrationBuilder.CreateIndex(
                name: "IX_task_instance_PlannedVisitId_TaskTemplateId",
                table: "task_instance",
                columns: new[] { "PlannedVisitId", "TaskTemplateId" },
                unique: true,
                filter: "[PlannedVisitId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_task_instance_TaskTemplateId",
                table: "task_instance",
                column: "TaskTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_task_template_Code",
                table: "task_template",
                column: "Code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rule");

            migrationBuilder.DropTable(
                name: "task_instance");

            migrationBuilder.DropTable(
                name: "task_template");
        }
    }
}
