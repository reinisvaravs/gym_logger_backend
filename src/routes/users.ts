import { Router } from "express";
import { registerUser } from "../db/users.js";
import argon2 from "argon2";
import validator from "validator";

const router = Router();

router.post("/register", async (req, res) => {
  // Validate body
  if (
    req.body === null ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    return res.status(400).json({
      message: "Request body must be a JSON object",
    });
  }

  // Get body
  const { firstName, email, password } = req.body;

  // Validate
  if (
    typeof firstName !== "string" ||
    firstName.trim().length > 100 ||
    firstName.trim().length < 2
  ) {
    return res.status(400).json({
      message: "First name must contain between 2 and 100 characters",
    });
  }

  if (typeof email !== "string") {
    return res.status(400).json({
      message: "Invalid email address",
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  if (!validator.isEmail(cleanEmail)) {
    return res.status(400).json({
      message: "Invalid email address",
    });
  }

  if (
    typeof password !== "string" ||
    password.length > 255 ||
    password.length < 4
  ) {
    return res.status(400).json({
      message: "Password must be atleast 4 characters long",
    });
  }

  // Insert in db
  try {
    // Hash password
    const passwordHash = await argon2.hash(password);

    const result = await registerUser(
      firstName.trim(),
      cleanEmail,
      passwordHash,
    );

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    console.error(error);
    return res.status(500).json({
      message: "failed to register user",
    });
  }
});

export default router;
