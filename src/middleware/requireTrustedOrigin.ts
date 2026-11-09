import type { RequestHandler } from "express";

export const requireTrustedOrigin: RequestHandler = (req, res, next) => {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    next();
    return;
  }

  const origin = req.get("Origin");
  const FRONTEND_URL = process.env.FRONTEND_URL;

  if (!FRONTEND_URL || !origin || origin !== FRONTEND_URL) {
    return res.status(403).json({
      message: "Request origin is not allowed",
    });
  }

  next();
};
