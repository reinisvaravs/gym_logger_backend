import pool from "./db.js";

export async function getTrainingSessionsByUserId(userId: string) {
  const result = await pool.query(
    `SELECT training_sessions.*,
            to_char(training_sessions.performed_on, 'YYYY-MM-DD') AS performed_on,
            training_types.training_name,
            training_types.category
     FROM training_sessions
     JOIN training_types ON training_sessions.training_type_id = training_types.id
     WHERE training_sessions.user_id = $1
     ORDER BY training_sessions.performed_on DESC, training_sessions.session_order ASC`,
    [userId],
  );

  return result.rows;
}

export async function getTrainingSessionById(userId: string, sessionId: string) {
  const result = await pool.query(
    `SELECT training_sessions.*,
            to_char(training_sessions.performed_on, 'YYYY-MM-DD') AS performed_on,
            training_types.training_name,
            training_types.category
     FROM training_sessions
     JOIN training_types ON training_sessions.training_type_id = training_types.id
     WHERE training_sessions.id = $1 AND training_sessions.user_id = $2`,
    [sessionId, userId],
  );

  const session = result.rows[0];

  if (!session) {
    return null;
  }

  const sets = await pool.query(
    `SELECT * FROM training_sets
     WHERE session_id = $1
     ORDER BY set_order`,
    [sessionId],
  );

  return { ...session, sets: sets.rows };
}

export async function updateTrainingSession(
  userId: string,
  sessionId: string,
  performedOn: string | undefined,
  sessionOrder: number | undefined,
  notes: string | null | undefined,
) {
  const result = await pool.query(
    `UPDATE training_sessions
     SET performed_on = COALESCE($1::date, performed_on),
         session_order = COALESCE($2::integer, session_order),
         notes = CASE WHEN $3::boolean THEN $4::text ELSE notes END
     WHERE id = $5 AND user_id = $6
     RETURNING *, to_char(performed_on, 'YYYY-MM-DD') AS performed_on`,
    [performedOn ?? null, sessionOrder ?? null, notes !== undefined,
      notes ?? null, sessionId, userId],
  );

  return result.rows[0];
}

export type TrainingSetInput = {
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  distanceKm?: number | null;
  avgHeartRateBpm?: number | null;
  avgPowerWatts?: number | null;
  avgCadence?: number | null;
  elevationGainM?: number | null;
};

export type TrainingSessionInput = {
  trainingTypeId: string;
  performedOn: string;
  sessionOrder: number;
  notes: string | null;
  sets: TrainingSetInput[];
};

export class TrainingSessionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function createTrainingSession(
  userId: string,
  input: TrainingSessionInput,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Keep the type from being archived, deleted, or changed while saving.
    const typeResult = await client.query(
      `SELECT category, archived_at FROM training_types
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [input.trainingTypeId, userId],
    );
    const trainingType = typeResult.rows[0];

    if (!trainingType) {
      throw new TrainingSessionError(404, "Training type not found");
    }
    if (trainingType.archived_at !== null) {
      throw new TrainingSessionError(
        409,
        "Unarchive this training type before creating a session",
      );
    }

    for (const [index, set] of input.sets.entries()) {
      const prefix = `Set ${index + 1}: `;

      if (trainingType.category === "cardio") {
        if (set.durationSeconds == null || set.distanceKm == null) {
          throw new TrainingSessionError(
            400,
            prefix + "cardio requires durationSeconds and distanceKm",
          );
        }
        if (set.reps != null || set.weightKg != null) {
          throw new TrainingSessionError(
            400,
            prefix + "cardio cannot contain reps or weightKg",
          );
        }
      } else {
        if (set.reps == null) {
          throw new TrainingSessionError(
            400,
            prefix + "strength requires reps",
          );
        }
        if (trainingType.category === "weighted_reps" && set.weightKg == null) {
          throw new TrainingSessionError(
            400,
            prefix + "weighted strength requires weightKg",
          );
        }
        if (
          set.durationSeconds != null ||
          set.distanceKm != null ||
          set.avgHeartRateBpm != null ||
          set.avgPowerWatts != null ||
          set.avgCadence != null ||
          set.elevationGainM != null
        ) {
          throw new TrainingSessionError(
            400,
            prefix + "strength cannot contain cardio measurements",
          );
        }
      }
    }

    const sessionResult = await client.query(
      `INSERT INTO training_sessions
         (user_id, training_type_id, performed_on, session_order, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        userId,
        input.trainingTypeId,
        input.performedOn,
        input.sessionOrder,
        input.notes,
      ],
    );
    const session = sessionResult.rows[0];
    const sets = [];

    for (const [index, set] of input.sets.entries()) {
      const result = await client.query(
        `INSERT INTO training_sets
          (session_id, set_order, reps, weight_kg, duration_seconds, distance_km,
           avg_heart_rate_bpm, avg_power_watts, avg_cadence, elevation_gain_m)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          session.id,
          index + 1,
          set.reps ?? null,
          set.weightKg ?? null,
          set.durationSeconds ?? null,
          set.distanceKm ?? null,
          set.avgHeartRateBpm ?? null,
          set.avgPowerWatts ?? null,
          set.avgCadence ?? null,
          set.elevationGainM ?? null,
        ],
      );
      sets.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return { ...session, performed_on: input.performedOn, sets };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
