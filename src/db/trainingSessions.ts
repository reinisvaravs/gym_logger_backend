import pool from "./db.js";

export async function deleteTrainingSession(userId: string, sessionId: string) {
  const result = await pool.query(
    `DELETE FROM training_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );

  return result.rowCount === 1;
}

export async function deleteTrainingSet(userId: string, sessionId: string, setId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialize set changes so two deletions cannot remove the final sets together.
    const sessionResult = await client.query(
      `SELECT id FROM training_sessions
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [sessionId, userId],
    );

    if (!sessionResult.rows[0]) {
      throw new TrainingSessionError(404, "Training set not found");
    }

    const setResult = await client.query(
      `SELECT id FROM training_sets WHERE id = $1 AND session_id = $2`,
      [setId, sessionId],
    );

    if (!setResult.rows[0]) {
      throw new TrainingSessionError(404, "Training set not found");
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::integer AS set_count FROM training_sets WHERE session_id = $1`,
      [sessionId],
    );

    if (countResult.rows[0].set_count <= 1) {
      throw new TrainingSessionError(409, "Cannot remove the last set. Delete the session instead.");
    }

    await client.query(
      `DELETE FROM training_sets WHERE id = $1 AND session_id = $2`,
      [setId, sessionId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getTrainingSessionsByUserId(
  userId: string,
  from?: string,
  to?: string,
  search?: string,
  category?: string,
) {
  const result = await pool.query(
    `SELECT training_sessions.*,
            to_char(training_sessions.performed_on, 'YYYY-MM-DD') AS performed_on,
            training_types.training_name,
            training_types.category
     FROM training_sessions
     JOIN training_types ON training_sessions.training_type_id = training_types.id
     WHERE training_sessions.user_id = $1
       AND ($2::date IS NULL OR training_sessions.performed_on >= $2::date)
       AND ($3::date IS NULL OR training_sessions.performed_on <= $3::date)
       AND ($4::text IS NULL OR strpos(lower(training_types.training_name), lower($4::text)) > 0)
       AND ($5::text IS NULL OR training_types.category = $5::text
         OR ($5::text = 'strength' AND training_types.category IN ('weighted_reps', 'bodyweight_reps')))
     ORDER BY training_sessions.performed_on DESC, training_sessions.session_order ASC`,
    [userId, from ?? null, to ?? null, search || null, category ?? null],
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

function validateSetCategory(category: string, set: TrainingSetInput) {
  if (category === "cardio") {
    if (set.durationSeconds == null || set.distanceKm == null) {
      throw new TrainingSessionError(
        400,
        "cardio requires durationSeconds and distanceKm",
      );
    }
    if (set.reps != null || set.weightKg != null) {
      throw new TrainingSessionError(
        400,
        "cardio cannot contain reps or weightKg",
      );
    }
  } else {
    if (set.reps == null) {
      throw new TrainingSessionError(
        400,
        "strength requires reps",
      );
    }
    if (category === "weighted_reps" && set.weightKg == null) {
      throw new TrainingSessionError(
        400,
        "weighted strength requires weightKg",
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
        "strength cannot contain cardio measurements",
      );
    }
  }
}

export async function addTrainingSet(
  userId: string,
  sessionId: string,
  set: TrainingSetInput,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock this session so concurrent additions choose different positions.
    const sessionResult = await client.query(
      `SELECT training_types.category
       FROM training_sessions
       JOIN training_types ON training_sessions.training_type_id = training_types.id
       WHERE training_sessions.id = $1 AND training_sessions.user_id = $2
       FOR UPDATE OF training_sessions`,
      [sessionId, userId],
    );
    const session = sessionResult.rows[0];

    if (!session) {
      throw new TrainingSessionError(404, "Training session not found");
    }

    validateSetCategory(session.category, set);

    const orderResult = await client.query(
      `SELECT COALESCE(MAX(set_order), 0) + 1 AS next_order
       FROM training_sets WHERE session_id = $1`,
      [sessionId],
    );
    const setOrder = orderResult.rows[0].next_order;

    const result = await client.query(
      `INSERT INTO training_sets
        (session_id, set_order, reps, weight_kg, duration_seconds, distance_km,
         avg_heart_rate_bpm, avg_power_watts, avg_cadence, elevation_gain_m)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [sessionId, setOrder, set.reps ?? null, set.weightKg ?? null,
        set.durationSeconds ?? null, set.distanceKm ?? null,
        set.avgHeartRateBpm ?? null, set.avgPowerWatts ?? null,
        set.avgCadence ?? null, set.elevationGainM ?? null],
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTrainingSet(
  userId: string,
  sessionId: string,
  setId: string,
  input: TrainingSetInput,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT training_sets.*, training_types.category
       FROM training_sets
       JOIN training_sessions ON training_sets.session_id = training_sessions.id
       JOIN training_types ON training_sessions.training_type_id = training_types.id
       WHERE training_sets.id = $1 AND training_sessions.id = $2
         AND training_sessions.user_id = $3
       FOR UPDATE OF training_sessions, training_sets`,
      [setId, sessionId, userId],
    );
    const current = currentResult.rows[0];

    if (!current) {
      throw new TrainingSessionError(404, "Training set not found");
    }

    // Omitted fields keep their stored values; null explicitly clears a field.
    const set = {
      reps: input.reps === undefined ? current.reps : input.reps,
      weightKg: input.weightKg === undefined ? current.weight_kg : input.weightKg,
      durationSeconds: input.durationSeconds === undefined ? current.duration_seconds : input.durationSeconds,
      distanceKm: input.distanceKm === undefined ? current.distance_km : input.distanceKm,
      avgHeartRateBpm: input.avgHeartRateBpm === undefined ? current.avg_heart_rate_bpm : input.avgHeartRateBpm,
      avgPowerWatts: input.avgPowerWatts === undefined ? current.avg_power_watts : input.avgPowerWatts,
      avgCadence: input.avgCadence === undefined ? current.avg_cadence : input.avgCadence,
      elevationGainM: input.elevationGainM === undefined ? current.elevation_gain_m : input.elevationGainM,
    };

    validateSetCategory(current.category, set);

    const result = await client.query(
      `UPDATE training_sets
       SET reps = $1, weight_kg = $2, duration_seconds = $3, distance_km = $4,
           avg_heart_rate_bpm = $5, avg_power_watts = $6, avg_cadence = $7,
           elevation_gain_m = $8
       WHERE id = $9 AND session_id = $10
       RETURNING *`,
      [set.reps, set.weightKg, set.durationSeconds, set.distanceKm,
        set.avgHeartRateBpm, set.avgPowerWatts, set.avgCadence,
        set.elevationGainM, setId, sessionId],
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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

    for (const set of input.sets) {
      validateSetCategory(trainingType.category, set);
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
