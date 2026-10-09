-- Manually create everything

BEGIN;

CREATE TABLE public.users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name text NOT NULL CHECK (btrim(full_name) <> ''),
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_types (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    training_name text NOT NULL CHECK (training_name = btrim(training_name) AND training_name <> ''),
    category text NOT NULL CHECK (category IN ('weighted_reps', 'bodyweight_reps', 'cardio')),
    created_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    UNIQUE (user_id, training_name),
    UNIQUE (user_id, id)
);

CREATE TABLE public.training_sessions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    training_type_id bigint NOT NULL,
    performed_on date NOT NULL,
    session_order integer NOT NULL CHECK (session_order > 0),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id, training_type_id)
        REFERENCES public.training_types(user_id, id) ON DELETE NO ACTION,
    UNIQUE (user_id, performed_on, session_order)
);

CREATE TABLE public.training_sets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id bigint NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
    set_order integer NOT NULL CHECK (set_order > 0),
    avg_heart_rate_bpm integer CHECK (avg_heart_rate_bpm BETWEEN 20 AND 250),
    duration_seconds integer CHECK (duration_seconds > 0),
    weight_kg numeric(10, 3) CHECK (weight_kg >= 0 AND weight_kg <> 'NaN'::numeric),
    reps numeric(5, 2) CHECK (reps > 0 AND reps <> 'NaN'::numeric),
    distance_km numeric(12, 3) CHECK (distance_km >= 0 AND distance_km <> 'NaN'::numeric),
    avg_power_watts numeric(10, 2) CHECK (avg_power_watts >= 0 AND avg_power_watts <> 'NaN'::numeric),
    avg_cadence numeric(7, 2) CHECK (avg_cadence >= 0 AND avg_cadence <> 'NaN'::numeric),
    elevation_gain_m numeric(12, 3) CHECK (elevation_gain_m >= 0 AND elevation_gain_m <> 'NaN'::numeric),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (reps IS NOT NULL OR duration_seconds IS NOT NULL),
    UNIQUE (session_id, set_order)
);

COMMIT;
