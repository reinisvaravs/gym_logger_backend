import { Router } from "express";
import {
  createTrainingType,
  getTrainingTypesByUserId,
  renameTrainingType,
  archiveTrainingType,
  unarchiveTrainingType,
} from "../db/trainingTypes.js";
import { requireJsonObject } from "../middleware/requireJsonObject.js";

const router = Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({
      message: "You must be logged in",
    });
  }

  try {
    const result = await getTrainingTypesByUserId(userId);

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to get training types",
    });
  }
});

router.post("/", requireJsonObject, async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({
      message: "You must be logged in",
    });
  }

  const { trainingName, category } = req.body;

  if (
    typeof trainingName !== "string" ||
    trainingName.trim().length < 1 ||
    trainingName.trim().length > 100
  ) {
    return res
      .status(400)
      .json({ message: "Training name must be a string and 1-100 long" });
  }

  const allowedCategories = ["weighted_reps", "bodyweight_reps", "cardio"];

  if (typeof category !== "string" || !allowedCategories.includes(category)) {
    return res.status(400).json({
      message: "Category must be weighted_reps, bodyweight_reps, or cardio",
    });
  }

  try {
    const result = await createTrainingType(
      userId,
      trainingName.trim(),
      category,
    );

    return res.status(201).json(result);
  } catch (error) {
    console.error(error);

    // unique-constraint (dupe)
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return res.status(409).json({
        message: "A training type with this name already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to create training type",
    });
  }
});

router.patch("/:id", requireJsonObject, async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const trainingTypeId = Number(req.params.id);

  if (!Number.isSafeInteger(trainingTypeId) || trainingTypeId <= 0) {
    return res.status(404).json({ message: "Training type not found" });
  }

  const { trainingName } = req.body;

  if (
    typeof trainingName !== "string" ||
    trainingName.trim().length < 1 ||
    trainingName.trim().length > 100
  ) {
    return res.status(400).json({
      message: "Training name must be a string and 1-100 long",
    });
  }

  try {
    const result = await renameTrainingType(
      userId,
      String(trainingTypeId),
      trainingName.trim(),
    );

    if (!result) {
      return res.status(404).json({ message: "Training type not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return res.status(409).json({
        message: "A training type with this name already exists",
      });
    }

    console.error(error);
    return res.status(500).json({ message: "Failed to rename training type" });
  }
});

router.patch("/:id/archive", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const trainingTypeId = Number(req.params.id);

  if (!Number.isSafeInteger(trainingTypeId) || trainingTypeId <= 0) {
    return res.status(404).json({ message: "Training type not found" });
  }

  try {
    const result = await archiveTrainingType(userId, String(trainingTypeId));

    if (!result) {
      return res.status(404).json({ message: "Training type not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to archive training type" });
  }
});

router.patch("/:id/unarchive", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const trainingTypeId = Number(req.params.id);

  if (!Number.isSafeInteger(trainingTypeId) || trainingTypeId <= 0) {
    return res.status(404).json({ message: "Training type not found" });
  }

  try {
    const result = await unarchiveTrainingType(userId, String(trainingTypeId));

    if (!result) {
      return res.status(404).json({ message: "Training type not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to unarchive training type" });
  }
});

export default router;
