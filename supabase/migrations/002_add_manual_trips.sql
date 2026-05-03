-- Make flight detail columns nullable to support manually-entered past trips
ALTER TABLE public.trips
  ALTER COLUMN outbound_airline       DROP NOT NULL,
  ALTER COLUMN outbound_flight_number DROP NOT NULL,
  ALTER COLUMN outbound_arrival_at    DROP NOT NULL,
  ALTER COLUMN return_airline         DROP NOT NULL,
  ALTER COLUMN return_flight_number   DROP NOT NULL,
  ALTER COLUMN return_arrival_at      DROP NOT NULL;

-- Track how the trip was created; existing rows default to 'search'
ALTER TABLE public.trips
  ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'search'
    CHECK (source IN ('search', 'manual'));
