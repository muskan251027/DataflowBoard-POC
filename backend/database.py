import re
import sqlite3
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parent / "projects.db"
SAFE_TABLE_NAME = re.compile(r"^[a-z][a-z0-9_]*$")


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def safe_details_table_name(project_name):
    normalized_name = re.sub(r"[^a-zA-Z0-9]+", "_", project_name).strip("_").lower()
    return f"{normalized_name or 'project'}_details"


def quote_table_name(table_name):
    if not SAFE_TABLE_NAME.fullmatch(table_name):
        raise ValueError("Invalid details table name")
    return f'"{table_name}"'


def table_exists(connection, table_name):
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone() is not None


def unique_details_table_name(connection, project_name):
    base_name = safe_details_table_name(project_name)
    table_name = base_name
    suffix = 2
    while table_exists(connection, table_name):
        table_name = f"{base_name[:-len('_details')]}_{suffix}_details"
        suffix += 1
    return table_name


def create_details_table(connection, table_name):
    connection.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {quote_table_name(table_name)} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL,
            category TEXT NOT NULL,
            achievement REAL NOT NULL
        )
        """
    )


def drop_details_table(connection, table_name):
    connection.execute(f"DROP TABLE IF EXISTS {quote_table_name(table_name)}")


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS SummaryData (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL,
                target TEXT NOT NULL,
                achievement_percent REAL NOT NULL,
                details_table_name TEXT
            )
            """
        )
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(SummaryData)")
        }
        if "details_table_name" not in columns:
            connection.execute(
                "ALTER TABLE SummaryData ADD COLUMN details_table_name TEXT"
            )

        projects = connection.execute(
            "SELECT id, project_name, details_table_name FROM SummaryData"
        ).fetchall()
        for project in projects:
            table_name = project["details_table_name"]
            if not table_name or not SAFE_TABLE_NAME.fullmatch(table_name):
                table_name = unique_details_table_name(
                    connection, project["project_name"]
                )
                connection.execute(
                    "UPDATE SummaryData SET details_table_name = ? WHERE id = ?",
                    (table_name, project["id"]),
                )
            create_details_table(connection, table_name)


def row_to_project(row):
    return dict(row)