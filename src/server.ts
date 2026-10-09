import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import dotenv from "dotenv";

import { testDB } from "./database.js";

dotenv.config();

const app = express();

// middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(cookieParser());

// health
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Gym Logger API",
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  try {
    await testDB();
  } catch (error) {
    console.error(error);
  }
});
