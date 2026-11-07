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

export async function getUserById(userId: string) {
  const result = await pool.query(
    `
    SELECT * FROM users
    WHERE id = $1;
    `,
    [userId],
  );
  return result.rows[0];
}

export async function changePasswordAndDeleteSessions(
  passwordHash: string,
  userId: string,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2`,
      [passwordHash, userId],
    );

    if (result.rowCount !== 1) {
      throw new Error("User not found during password update");
    }

    await client.query(
      `DELETE FROM session
       WHERE sess->>'userId' = $1`,
      [userId],
    );

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteUser(userId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `DELETE FROM users
      WHERE id = $1;`,
      [userId],
    );

    if (result.rowCount !== 1) {
      throw new Error("User not found during account deletion");
    }

    await client.query(
      `DELETE FROM session
       WHERE sess->>'userId' = $1`,
      [userId],
    );

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
