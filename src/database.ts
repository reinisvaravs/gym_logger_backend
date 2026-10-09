import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const DB_PORT = Number(process.env.DB_PORT);

function isValidPort() {
  if (!Number.isInteger(DB_PORT) || DB_PORT < 1 || DB_PORT > 65535) {
    throw new Error("DB_PORT must be an integer between 1 and 65535");
  }

  return DB_PORT;
}

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: isValidPort(),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export async function testDB() {
  try {
    const result = await pool.query(`SELECT NOW()`);
    console.log(result.rows);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export default pool;
