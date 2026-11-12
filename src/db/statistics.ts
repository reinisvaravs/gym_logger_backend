import pool from "./db.js";

type StatsSet = {
  id: string;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  avg_heart_rate_bpm: number | null;
};

type StatsSession = {
  id: string;
  date: string;
  sets: StatsSet[];
};

type Exercise = {
  id: string;
  name: string;
  category: string;
  archived: boolean;
  history: StatsSession[];
};

type StatsRow = StatsSet & {
  session_id: string;
  date: string;
  type_id: string;
  name: string;
  category: string;
  archived: boolean;
};

function weekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function recentWeeks(to: string, from?: string) {
  const end = new Date(`${weekStart(to)}T00:00:00Z`);
  const weeks: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - i * 7);
    const week = date.toISOString().slice(0, 10);
    if (!from || week >= weekStart(from)) weeks.push(week);
  }
  return weeks;
}

function cardioTotals(sessions: StatsSession[]) {
  const sets = sessions.flatMap((session) => session.sets);
  const distanceSets = sets.filter((set) => set.distance_km !== null);
  const speedSets = distanceSets.filter((set) => (set.duration_seconds ?? 0) > 0);
  const heartSets = sets.filter((set) => set.avg_heart_rate_bpm !== null && (set.duration_seconds ?? 0) > 0);
  const speedDuration = speedSets.reduce((sum, set) => sum + set.duration_seconds!, 0);
  const heartDuration = heartSets.reduce((sum, set) => sum + set.duration_seconds!, 0);
  return {
    duration_seconds: sets.reduce((sum, set) => sum + (set.duration_seconds ?? 0), 0),
    distance_km: distanceSets.length ? distanceSets.reduce((sum, set) => sum + set.distance_km!, 0) : sets.length === 0 ? 0 : null,
    average_speed_kmh: speedDuration ? speedSets.reduce((sum, set) => sum + set.distance_km!, 0) / speedDuration * 3600 : null,
    average_heart_rate_bpm: heartDuration ? heartSets.reduce((sum, set) => sum + set.avg_heart_rate_bpm! * set.duration_seconds!, 0) / heartDuration : null,
    set_count: sets.length,
    distance_sets: distanceSets.length,
    heart_rate_sets: heartSets.length,
  };
}

export async function getStatistics(userId: string, to: string, from?: string) {
  // One owner-scoped query. Aggregate the returned sets without counting a
  // multi-exercise training day once for every exercise or set.
  const result = await pool.query<StatsRow>(
    `SELECT st.id, st.reps::double precision, st.weight_kg::double precision,
            st.duration_seconds, st.distance_km::double precision, st.avg_heart_rate_bpm,
            s.id AS session_id, to_char(s.performed_on, 'YYYY-MM-DD') AS date,
            t.id AS type_id, t.training_name AS name, t.category,
            (t.archived_at IS NOT NULL) AS archived
     FROM training_sessions s
     JOIN training_types t ON t.id = s.training_type_id AND t.user_id = s.user_id
     JOIN training_sets st ON st.session_id = s.id
     WHERE s.user_id = $1
       AND ($2::date IS NULL OR s.performed_on >= $2::date)
       AND s.performed_on <= $3::date
     ORDER BY t.training_name, s.performed_on, s.session_order, st.set_order`,
    [userId, from ?? null, to],
  );

  const exercises = new Map<string, Exercise>();
  const sessions = new Map<string, StatsSession>();
  for (const row of result.rows) {
    let exercise = exercises.get(row.type_id);
    if (!exercise) {
      exercise = { id: row.type_id, name: row.name, category: row.category, archived: row.archived, history: [] };
      exercises.set(row.type_id, exercise);
    }
    let session = sessions.get(row.session_id);
    if (!session) {
      session = { id: row.session_id, date: row.date, sets: [] };
      sessions.set(row.session_id, session);
      exercise.history.push(session);
    }
    session.sets.push({ id: row.id, reps: row.reps, weight_kg: row.weight_kg,
      duration_seconds: row.duration_seconds, distance_km: row.distance_km,
      avg_heart_rate_bpm: row.avg_heart_rate_bpm });
  }

  const all = [...exercises.values()];
  const strength = all.filter((exercise) => exercise.category !== "cardio");
  const cardio = all.filter((exercise) => exercise.category === "cardio");
  const strengthSessions = strength.flatMap((exercise) => exercise.history);
  const cardioSessions = cardio.flatMap((exercise) => exercise.history);
  const weeks = recentWeeks(to, from);

  return {
    from: from ?? null,
    to,
    overview: {
      training_days: new Set([...sessions.values()].map((session) => session.date)).size,
      strength_sets: strengthSessions.reduce((sum, session) => sum + session.sets.length, 0),
      cardio: cardioTotals(cardioSessions),
    },
    weekly: weeks.map((week) => ({
      week,
      strength_days: new Set(strengthSessions.filter((session) => weekStart(session.date) === week).map((session) => session.date)).size,
      cardio_days: new Set(cardioSessions.filter((session) => weekStart(session.date) === week).map((session) => session.date)).size,
    })),
    strength: strength.map((exercise) => {
      const records = new Map<number | null, { weight_kg: number | null; reps: number; date: string; session_id: string }>();
      for (const session of exercise.history) {
        for (const set of session.sets) {
          if (set.reps === null || (exercise.category === "weighted_reps" && set.weight_kg === null)) continue;
          const weight = exercise.category === "bodyweight_reps" && (set.weight_kg ?? 0) === 0 ? null : set.weight_kg;
          const best = records.get(weight);
          if (!best || set.reps > best.reps) {
            records.set(weight, { weight_kg: weight, reps: set.reps, date: session.date, session_id: session.id });
          }
        }
      }
      return {
        ...exercise,
        records: [...records.values()].sort((a, b) => (a.weight_kg ?? -1) - (b.weight_kg ?? -1)).map((record) => {
          const days = new Map<string, { date: string; value: number; session_id: string }>();
          for (const session of exercise.history) {
            for (const set of session.sets) {
              const weight = exercise.category === "bodyweight_reps" && (set.weight_kg ?? 0) === 0 ? null : set.weight_kg;
              if (weight !== record.weight_kg || set.reps === null) continue;
              const best = days.get(session.date);
              if (!best || set.reps > best.value) days.set(session.date, { date: session.date, value: set.reps, session_id: session.id });
            }
          }
          return { ...record, progress: [...days.values()] };
        }),
        weekly: weeks.map((week) => {
          const sets = exercise.history.filter((session) => weekStart(session.date) === week).flatMap((session) => session.sets);
          return { week, sets: sets.length,
            reps: sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
            volume: sets.reduce((sum, set) => sum + (set.reps ?? 0) * (set.weight_kg ?? 0), 0) };
        }),
      };
    }),
    cardio: cardio.map((exercise) => {
      const history = exercise.history.map((session) => ({ id: session.id, date: session.date, ...cardioTotals([session]) }));
      return {
        id: exercise.id, name: exercise.name, archived: exercise.archived,
        summary: cardioTotals(exercise.history), history,
        longest_duration: [...history].sort((a, b) => b.duration_seconds - a.duration_seconds)[0] ?? null,
        longest_distance: history.filter((session) => session.distance_km !== null)
          .sort((a, b) => b.distance_km! - a.distance_km!)[0] ?? null,
        weekly: weeks.map((week) => ({ week, ...cardioTotals(exercise.history.filter((session) => weekStart(session.date) === week)) })),
      };
    }),
  };
}
