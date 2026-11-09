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
