import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { ErrorRequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pool from "./db/db.js";
import userRoutes from "./routes/userAuth.js";
import meRoutes from "./routes/me.js";
import { requireTrustedOrigin } from "./middleware/requireTrustedOrigin.js";
import trainingTypesRoutes from "./routes/trainingTypes.js";
import trainingSessionsRoutes from "./routes/trainingSessions.js";

import { testDB } from "./db/db.js";

dotenv.config();

const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";
const frontendUrl = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL;

if (!frontendUrl) {
  throw new Error("FRONTEND_URL is required outside Render");
}
process.env.FRONTEND_URL = new URL(frontendUrl).origin;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required");
}
if (isProduction && sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters in production");
}

const PgSessionStore = connectPgSimple(session);

const app = express();
app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);

// middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// health
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Gym Logger API",
  });
});

const api = express.Router();
api.use(requireTrustedOrigin);
api.use(
  session({
    store: new PgSessionStore({
      pool,
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    name: "gym.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

api.use("/users", userRoutes);
api.use("/training-types", trainingTypesRoutes);
api.use("/training-sessions", trainingSessionsRoutes);
api.use("/", meRoutes);
api.use((req, res) => {
  res.status(404).json({ message: "API route not found" });
});

app.use("/api", api);
// Preserve the existing local .rest requests while production uses /api.
if (!isProduction) app.use(api);

if (isProduction) {
  const frontendDist = fileURLToPath(new URL("../.render/frontend/dist/", import.meta.url));
  if (!existsSync(path.join(frontendDist, "index.html"))) {
    throw new Error("Frontend build is missing. Run npm run build:render in the backend repository.");
  }
  app.use(express.static(frontendDist, { index: false }));
  app.get("/{*path}", (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile("index.html", { root: frontendDist });
  });
}

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    res.status(400).json({ message: "Invalid JSON body" });
    return;
  }
  if (error.type === "entity.too.large") {
    res.status(413).json({ message: "Request body is too large" });
    return;
  }
  console.error(error);
  res.status(500).json({ message: "Something went wrong" });
};
app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

async function start() {
  try {
    await testDB();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  }
}

void start();
