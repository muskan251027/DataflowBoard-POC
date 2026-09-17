from flask import Flask, jsonify, request
from flask_cors import CORS

from database import (
    create_details_table,
    drop_details_table,
    get_connection,
    initialize_database,
    quote_table_name,
    row_to_project,
    unique_details_table_name,
)


app = Flask(__name__)
CORS(app)
initialize_database()


def validate_project(data):
    if not isinstance(data, dict):
        return "Request body must be a JSON object."

    for field in ("project_name", "target"):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            return f"{field} cannot be empty."

    try:
        achievement_percent = float(data.get("achievement_percent"))
    except (TypeError, ValueError):
        return "achievement_percent must be a number between 0 and 100."

    if not 0 <= achievement_percent <= 100:
        return "achievement_percent must be a number between 0 and 100."

    return None


def validate_detail(data):
    if not isinstance(data, dict):
        return "Request body must be a JSON object."

    for field in ("project_name", "category"):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            return f"{field} cannot be empty."

    try:
        float(data.get("achievement"))
    except (TypeError, ValueError):
        return "achievement must be a number."

    return None


@app.get("/api/health")
def health_check():
    return jsonify({"status": "Backend is running"})


@app.get("/api/projects")
def get_projects():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, project_name, target, achievement_percent, "
            "details_table_name "
            "FROM SummaryData ORDER BY id"
        ).fetchall()
    return jsonify([row_to_project(row) for row in rows])


@app.post("/api/projects")
def create_project():
    data = request.get_json(silent=True)
    error = validate_project(data)
    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO SummaryData "
            "(project_name, target, achievement_percent, details_table_name) "
            "VALUES (?, ?, ?, ?)",
            (
                data["project_name"].strip(),
                data["target"].strip(),
                float(data["achievement_percent"]),
                unique_details_table_name(connection, data["project_name"].strip()),
            ),
        )
        project = connection.execute(
            "SELECT id, project_name, target, achievement_percent, "
            "details_table_name FROM SummaryData WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        create_details_table(connection, project["details_table_name"])
    return jsonify(row_to_project(project)), 201


@app.put("/api/projects/<int:project_id>")
def update_project(project_id):
    data = request.get_json(silent=True)
    error = validate_project(data)
    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM SummaryData WHERE id = ?", (project_id,)
        ).fetchone()
        if existing is None:
            return jsonify({"error": "Project not found."}), 404

        connection.execute(
            "UPDATE SummaryData SET project_name = ?, target = ?, "
            "achievement_percent = ? WHERE id = ?",
            (
                data["project_name"].strip(),
                data["target"].strip(),
                float(data["achievement_percent"]),
                project_id,
            ),
        )
        project = connection.execute(
            "SELECT id, project_name, target, achievement_percent, "
            "details_table_name "
            "FROM SummaryData WHERE id = ?",
            (project_id,),
        ).fetchone()
    return jsonify(row_to_project(project))


@app.delete("/api/projects/<int:project_id>")
def delete_project(project_id):
    with get_connection() as connection:
        project = connection.execute(
            "SELECT details_table_name FROM SummaryData WHERE id = ?",
            (project_id,),
        ).fetchone()
        if project is None:
            return jsonify({"error": "Project not found."}), 404
        drop_details_table(connection, project["details_table_name"])
        connection.execute("DELETE FROM SummaryData WHERE id = ?", (project_id,))
    return jsonify({"message": "Project deleted."})


def get_project_details_table(connection, project_id):
    project = connection.execute(
        "SELECT details_table_name FROM SummaryData WHERE id = ?", (project_id,)
    ).fetchone()
    return project["details_table_name"] if project else None


@app.get("/api/projects/<int:project_id>/details")
def get_project_details(project_id):
    with get_connection() as connection:
        table_name = get_project_details_table(connection, project_id)
        if table_name is None:
            return jsonify({"error": "Project not found."}), 404
        rows = connection.execute(
            f"SELECT id, project_name, category, achievement FROM "
            f"{quote_table_name(table_name)} ORDER BY id"
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/projects/<int:project_id>/details")
def create_project_detail(project_id):
    data = request.get_json(silent=True)
    error = validate_detail(data)
    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        table_name = get_project_details_table(connection, project_id)
        if table_name is None:
            return jsonify({"error": "Project not found."}), 404
        cursor = connection.execute(
            f"INSERT INTO {quote_table_name(table_name)} "
            "(project_name, category, achievement) VALUES (?, ?, ?)",
            (
                data["project_name"].strip(),
                data["category"].strip(),
                float(data["achievement"]),
            ),
        )
        detail = connection.execute(
            f"SELECT id, project_name, category, achievement FROM "
            f"{quote_table_name(table_name)} WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return jsonify(dict(detail)), 201


@app.put("/api/projects/<int:project_id>/details/<int:detail_id>")
def update_project_detail(project_id, detail_id):
    data = request.get_json(silent=True)
    error = validate_detail(data)
    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        table_name = get_project_details_table(connection, project_id)
        if table_name is None:
            return jsonify({"error": "Project not found."}), 404
        cursor = connection.execute(
            f"UPDATE {quote_table_name(table_name)} SET project_name = ?, "
            "category = ?, achievement = ? WHERE id = ?",
            (
                data["project_name"].strip(),
                data["category"].strip(),
                float(data["achievement"]),
                detail_id,
            ),
        )
        if cursor.rowcount == 0:
            return jsonify({"error": "Detail not found."}), 404
        detail = connection.execute(
            f"SELECT id, project_name, category, achievement FROM "
            f"{quote_table_name(table_name)} WHERE id = ?",
            (detail_id,),
        ).fetchone()
    return jsonify(dict(detail))


@app.delete("/api/projects/<int:project_id>/details/<int:detail_id>")
def delete_project_detail(project_id, detail_id):
    with get_connection() as connection:
        table_name = get_project_details_table(connection, project_id)
        if table_name is None:
            return jsonify({"error": "Project not found."}), 404
        cursor = connection.execute(
            f"DELETE FROM {quote_table_name(table_name)} WHERE id = ?",
            (detail_id,),
        )
        if cursor.rowcount == 0:
            return jsonify({"error": "Detail not found."}), 404
    return jsonify({"message": "Detail deleted."})


if __name__ == "__main__":
    app.run(debug=True, port=5000)