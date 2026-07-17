using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Evo.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddNote : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "note",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AnchorType = table.Column<byte>(type: "tinyint", nullable: false),
                    AnchorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AnchorDay = table.Column<DateOnly>(type: "date", nullable: true),
                    Kind = table.Column<byte>(type: "tinyint", nullable: false),
                    Body = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<byte>(type: "tinyint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_note", x => x.Id);
                    table.ForeignKey(
                        name: "FK_note_AspNetUsers_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_note_AnchorType_AnchorId",
                table: "note",
                columns: new[] { "AnchorType", "AnchorId" });

            migrationBuilder.CreateIndex(
                name: "IX_note_AuthorId",
                table: "note",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_note_Status_Kind",
                table: "note",
                columns: new[] { "Status", "Kind" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "note");
        }
    }
}
