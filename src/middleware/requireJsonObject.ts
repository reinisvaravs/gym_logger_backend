import type { RequestHandler } from "express";

export const requireJsonObject: RequestHandler = (req, res, next) => {
  if (
    req.body === null ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({
      message: "Request body must be a JSON object",
    });
    return;
  }

  next();
};
