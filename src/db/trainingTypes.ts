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
