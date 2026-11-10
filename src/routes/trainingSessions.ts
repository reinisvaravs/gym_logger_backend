import { Router } from "express";
import validator from "validator";
import { requireJsonObject } from "../middleware/requireJsonObject.js";
import {
  createTrainingSession,
  getTrainingSessionsByUserId,
  TrainingSessionError,
  type TrainingSetInput,
} from "../db/trainingSessions.js";

const router = Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  try {
    const result = await getTrainingSessionsByUserId(userId);
    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to get training sessions" });
  }
});

// Measurements may be omitted, but supplied values must be valid numbers.
function isOptionalNumber(value: unknown) {
  return (
    value == null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

router.post("/", requireJsonObject, async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const { trainingTypeId, performedOn, sessionOrder, notes, sets } = req.body;
  const typeId = Number(trainingTypeId);

  if (!Number.isSafeInteger(typeId) || typeId <= 0) {
    return res.status(400).json({ message: "Invalid training type ID" });
  }

  if (
    typeof performedOn !== "string" ||
    !validator.isDate(performedOn, { format: "YYYY-MM-DD", strictMode: true })
  ) {
    return res.status(400).json({ message: "Use a valid YYYY-MM-DD date" });
  }

  if (!Number.isSafeInteger(sessionOrder) || sessionOrder < 1) {
    return res
      .status(400)
      .json({ message: "Session order must be a positive integer" });
  }

  if (notes != null && typeof notes !== "string") {
    return res.status(400).json({ message: "Notes must be a string" });
  }

  if (!Array.isArray(sets) || sets.length === 0) {
    return res.status(400).json({ message: "Include at least one set" });
  }

  const cleanSets: TrainingSetInput[] = [];

  for (const set of sets) {
    if (set === null || typeof set !== "object" || Array.isArray(set)) {
      return res.status(400).json({ message: "Each set must be an object" });
    }

    if (!isOptionalNumber(set.reps) || (set.reps != null && set.reps <= 0)) {
      return res
        .status(400)
        .json({ message: "Reps must be a positive number" });
    }

    if (!isOptionalNumber(set.weightKg)) {
      return res.status(400).json({ message: "Weight must be zero or more" });
    }

    if (
      !isOptionalNumber(set.durationSeconds) ||
      (set.durationSeconds != null &&
        (!Number.isInteger(set.durationSeconds) || set.durationSeconds < 1))
    ) {
      return res
        .status(400)
        .json({
          message: "Duration must be a positive whole number of seconds",
        });
    }

    if (!isOptionalNumber(set.distanceKm)) {
      return res.status(400).json({ message: "Distance must be zero or more" });
    }

    if (
      !isOptionalNumber(set.avgHeartRateBpm) ||
      (set.avgHeartRateBpm != null &&
        (!Number.isInteger(set.avgHeartRateBpm) ||
          set.avgHeartRateBpm < 20 ||
          set.avgHeartRateBpm > 250))
    ) {
      return res
        .status(400)
        .json({
          message: "Heart rate must be a whole number between 20 and 250",
        });
    }

    if (!isOptionalNumber(set.avgPowerWatts)) {
      return res.status(400).json({ message: "Power must be zero or more" });
    }

    if (!isOptionalNumber(set.avgCadence)) {
      return res.status(400).json({ message: "Cadence must be zero or more" });
    }

    if (!isOptionalNumber(set.elevationGainM)) {
      return res
        .status(400)
        .json({ message: "Elevation gain must be zero or more" });
    }

    cleanSets.push({
      reps: set.reps ?? null,
      weightKg: set.weightKg ?? null,
      durationSeconds: set.durationSeconds ?? null,
      distanceKm: set.distanceKm ?? null,
      avgHeartRateBpm: set.avgHeartRateBpm ?? null,
      avgPowerWatts: set.avgPowerWatts ?? null,
      avgCadence: set.avgCadence ?? null,
      elevationGainM: set.elevationGainM ?? null,
    });
  }

  try {
    const result = await createTrainingSession(userId, {
      trainingTypeId: String(typeId),
      performedOn,
      sessionOrder,
      notes: notes?.trim() ?? null,
      sets: cleanSets,
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof TrainingSessionError) {
      return res.status(error.status).json({ message: error.message });
    }

    if (error instanceof Error && "code" in error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({
            message: "A session already uses this position on that date",
          });
      }
      // Let database constraints handle storage limits instead of duplicating them here.
      if (
        error.code === "22003" ||
        error.code === "22008" ||
        error.code === "23514"
      ) {
        return res
          .status(400)
          .json({
            message:
              "A date or measurement is outside the database's allowed range",
          });
      }
    }

    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to create training session" });
  }
});

export default router;
