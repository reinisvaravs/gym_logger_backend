import pg from "pg";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

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
  ssl: process.env.NODE_ENV === "production" || process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA
          ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
          : [...rootCertificates, readFileSync(new URL("../../certs/supabase-ca.crt", import.meta.url), "utf8")],
      }
    : false,
  max: 5,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (error) => {
  console.error("Unexpected database pool error", error);
});

export async function testDB() {
  try {
    await pool.query(`SELECT NOW()`);
    console.log("Database connection established");
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export default pool;
