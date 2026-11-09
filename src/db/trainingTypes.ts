import pool from "./db.js";

export async function getTrainingTypesByUserId(userId: string) {
  const result = await pool.query(
    `SELECT * FROM training_types
      WHERE user_id = $1
      ORDER BY training_name`,
    [userId],
  );

  return result.rows;
}

export async function createTrainingType(
  userId: string,
  trainingName: string,
  category: string,
) {
  const result = await pool.query(
    `INSERT INTO training_types (user_id, training_name, category)
      VALUES ($1, $2, $3)
      RETURNING *`,
    [userId, trainingName, category],
  );

  return result.rows[0];
}

export async function renameTrainingType(
  userId: string,
  trainingTypeId: string,
  trainingName: string,
) {
  const result = await pool.query(
    `UPDATE training_types
      SET training_name = $1
      WHERE id = $2 AND user_id = $3
      RETURNING *`,
    [trainingName, trainingTypeId, userId],
  );

  return result.rows[0];
}

export async function archiveTrainingType(userId: string, trainingTypeId: string) {
  const result = await pool.query(
    `UPDATE training_types
      SET archived_at = COALESCE(archived_at, NOW())
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [trainingTypeId, userId],
  );

  return result.rows[0];
}

export async function unarchiveTrainingType(userId: string, trainingTypeId: string) {
  const result = await pool.query(
    `UPDATE training_types
      SET archived_at = NULL
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [trainingTypeId, userId],
  );

  return result.rows[0];
}
