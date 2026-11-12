import { Router } from "express";
import validator from "validator";
import { requireJsonObject } from "../middleware/requireJsonObject.js";
import {
  createTrainingSession,
  addTrainingSet,
  updateTrainingSet,
  deleteTrainingSet,
  getTrainingSessionsByUserId,
  getTrainingSessionById,
  updateTrainingSession,
  deleteTrainingSession,
  TrainingSessionError,
  type TrainingSetInput,
} from "../db/trainingSessions.js";

const router = Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const { from, to, search, category } = req.query;

  if (from !== undefined && (
    typeof from !== "string" ||
    !validator.isDate(from, { format: "YYYY-MM-DD", strictMode: true })
  )) {
    return res.status(400).json({ message: "from must be a valid YYYY-MM-DD date" });
  }

  if (to !== undefined && (
    typeof to !== "string" ||
    !validator.isDate(to, { format: "YYYY-MM-DD", strictMode: true })
  )) {
    return res.status(400).json({ message: "to must be a valid YYYY-MM-DD date" });
  }

  if (from !== undefined && to !== undefined && from > to) {
    return res.status(400).json({ message: "from cannot be later than to" });
  }

  if (search !== undefined && (typeof search !== "string" || search.trim().length > 100)) {
    return res.status(400).json({ message: "Search must be a string up to 100 characters" });
  }

  if (category !== undefined && category !== "strength" && category !== "cardio") {
    return res.status(400).json({ message: "Category must be strength or cardio" });
  }

  try {
    const result = await getTrainingSessionsByUserId(
      userId, from, to, search?.trim(), category,
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to get training sessions" });
  }
});

router.get("/:id", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const sessionId = Number(req.params.id);

  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return res.status(404).json({ message: "Training session not found" });
  }

  try {
    const result = await getTrainingSessionById(userId, String(sessionId));

    if (!result) {
      return res.status(404).json({ message: "Training session not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to get training session" });
  }
});

router.patch("/:id", requireJsonObject, async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const sessionId = Number(req.params.id);

  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return res.status(404).json({ message: "Training session not found" });
  }

  const { performedOn, sessionOrder, notes } = req.body;

  if (performedOn === undefined && sessionOrder === undefined && notes === undefined) {
    return res.status(400).json({ message: "Provide a date, session order, or notes to update" });
  }

  if (performedOn !== undefined && (
    typeof performedOn !== "string" ||
    !validator.isDate(performedOn, { format: "YYYY-MM-DD", strictMode: true })
  )) {
    return res.status(400).json({ message: "Use a valid YYYY-MM-DD date" });
  }

  if (sessionOrder !== undefined && (
    !Number.isSafeInteger(sessionOrder) || sessionOrder < 1
  )) {
    return res.status(400).json({ message: "Session order must be a positive integer" });
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return res.status(400).json({ message: "Notes must be a string or null" });
  }

  try {
    const result = await updateTrainingSession(
      userId, String(sessionId), performedOn, sessionOrder,
      typeof notes === "string" ? notes.trim() : notes,
    );

    if (!result) {
      return res.status(404).json({ message: "Training session not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "A session already uses this position on that date" });
      }
      if (error.code === "22003" || error.code === "22007" || error.code === "22008" || error.code === "23514") {
        return res.status(400).json({ message: "Invalid date or session order" });
      }
    }

    console.error(error);
    return res.status(500).json({ message: "Failed to update training session" });
  }
});

// Measurements may be omitted, but supplied values must be valid numbers.
function isOptionalNumber(value: unknown) {
  return (
    value == null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function getSetValidationError(set: TrainingSetInput) {
  if (!isOptionalNumber(set.reps) || (set.reps != null && set.reps <= 0)) {
    return "Reps must be a positive number";
  }

  if (!isOptionalNumber(set.weightKg)) {
    return "Weight must be zero or more";
  }

  if (
    !isOptionalNumber(set.durationSeconds) ||
    (set.durationSeconds != null &&
      (!Number.isInteger(set.durationSeconds) || set.durationSeconds < 1))
  ) {
    return "Duration must be a positive whole number of seconds";
  }

  if (!isOptionalNumber(set.distanceKm)) {
    return "Distance must be zero or more";
  }

  if (
    !isOptionalNumber(set.avgHeartRateBpm) ||
    (set.avgHeartRateBpm != null &&
      (!Number.isInteger(set.avgHeartRateBpm) ||
        set.avgHeartRateBpm < 20 ||
        set.avgHeartRateBpm > 250))
  ) {
    return "Heart rate must be a whole number between 20 and 250";
  }

  if (!isOptionalNumber(set.avgPowerWatts)) {
    return "Power must be zero or more";
  }

  if (!isOptionalNumber(set.avgCadence)) {
    return "Cadence must be zero or more";
  }

  if (!isOptionalNumber(set.elevationGainM)) {
    return "Elevation gain must be zero or more";
  }

  return null;
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

    const message = getSetValidationError(set);
    if (message) {
      return res.status(400).json({ message });
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

router.post("/:id/sets", requireJsonObject, async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const sessionId = Number(req.params.id);

  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return res.status(404).json({ message: "Training session not found" });
  }

  const message = getSetValidationError(req.body);
  if (message) {
    return res.status(400).json({ message });
  }

  const set: TrainingSetInput = {
    reps: req.body.reps ?? null,
    weightKg: req.body.weightKg ?? null,
    durationSeconds: req.body.durationSeconds ?? null,
    distanceKm: req.body.distanceKm ?? null,
    avgHeartRateBpm: req.body.avgHeartRateBpm ?? null,
    avgPowerWatts: req.body.avgPowerWatts ?? null,
    avgCadence: req.body.avgCadence ?? null,
    elevationGainM: req.body.elevationGainM ?? null,
  };

  try {
    const result = await addTrainingSet(userId, String(sessionId), set);
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof TrainingSessionError) {
      return res.status(error.status).json({ message: error.message });
    }

    if (error instanceof Error && "code" in error) {
      if (error.code === "22003" || error.code === "23514") {
        return res.status(400).json({ message: "A measurement is outside the database's allowed range" });
      }
    }

    console.error(error);
    return res.status(500).json({ message: "Failed to add training set" });
  }
});

router.patch("/:id/sets/:setId", requireJsonObject, async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const sessionId = Number(req.params.id);
  const setId = Number(req.params.setId);

  if (
    !Number.isSafeInteger(sessionId) || sessionId <= 0 ||
    !Number.isSafeInteger(setId) || setId <= 0
  ) {
    return res.status(404).json({ message: "Training set not found" });
  }

  const { reps, weightKg, durationSeconds, distanceKm,
    avgHeartRateBpm, avgPowerWatts, avgCadence, elevationGainM } = req.body;

  if (
    reps === undefined && weightKg === undefined && durationSeconds === undefined &&
    distanceKm === undefined && avgHeartRateBpm === undefined &&
    avgPowerWatts === undefined && avgCadence === undefined && elevationGainM === undefined
  ) {
    return res.status(400).json({ message: "Provide at least one measurement to update" });
  }

  const message = getSetValidationError(req.body);
  if (message) {
    return res.status(400).json({ message });
  }

  try {
    const result = await updateTrainingSet(
      userId, String(sessionId), String(setId), req.body,
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof TrainingSessionError) {
      return res.status(error.status).json({ message: error.message });
    }

    if (error instanceof Error && "code" in error) {
      if (error.code === "22003" || error.code === "23514") {
        return res.status(400).json({ message: "A measurement is outside the database's allowed range" });
      }
    }

    console.error(error);
    return res.status(500).json({ message: "Failed to update training set" });
  }
});

router.delete("/:id/sets/:setId", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const sessionId = Number(req.params.id);
  const setId = Number(req.params.setId);

  if (
    !Number.isSafeInteger(sessionId) || sessionId <= 0 ||
    !Number.isSafeInteger(setId) || setId <= 0
  ) {
    return res.status(404).json({ message: "Training set not found" });
  }

  try {
    await deleteTrainingSet(userId, String(sessionId), String(setId));
    return res.status(204).send();
  } catch (error) {
    if (error instanceof TrainingSessionError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error(error);
    return res.status(500).json({ message: "Failed to delete training set" });
  }
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "You must be logged in" });
  }

  const sessionId = Number(req.params.id);

  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return res.status(404).json({ message: "Training session not found" });
  }

  try {
    const deleted = await deleteTrainingSession(userId, String(sessionId));

    if (!deleted) {
      return res.status(404).json({ message: "Training session not found" });
    }

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete training session" });
  }
});

export default router;
