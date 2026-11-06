import pool from "./db.js";

export async function registerUser(
  fullName: string,
  email: string,
  passwordHash: string,
) {
  const result = await pool.query(
    `
    INSERT INTO users (full_name, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, full_name, email, created_at;
    `,
    [fullName, email, passwordHash],
  );
  return result.rows[0];
}

export async function getUserByEmail(email: string) {
  const result = await pool.query(
    `
    SELECT * FROM users
    WHERE email = $1;
    `,
    [email],
  );
  return result.rows[0];
}
