-- ============================================================
-- My Travel Assistant — Multi-City Support
-- ============================================================

-- Step 1: Add trip_type to trips (existing rows are all round_trip)
ALTER TABLE public.trips
  ADD COLUMN trip_type varchar(20) NOT NULL DEFAULT 'round_trip'
    CHECK (trip_type IN ('round_trip', 'multi_city'));

-- Step 2: Create trip_legs — unified leg store for all trip types
CREATE TABLE public.trip_legs (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        uuid         NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  leg_order      smallint     NOT NULL CHECK (leg_order BETWEEN 1 AND 3),
  from_airport   varchar(3)   NOT NULL,
  to_airport     varchar(3)   NOT NULL,
  airline        varchar(100),
  flight_number  varchar(10),
  departure_at   timestamptz  NOT NULL,
  arrival_at     timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (trip_id, leg_order)
);

-- Step 3: Backfill existing round-trips into trip_legs

-- Outbound legs (leg_order = 1)
INSERT INTO public.trip_legs (trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at)
SELECT
  id,
  1,
  departure_airport,
  destination_airport,
  outbound_airline,
  outbound_flight_number,
  outbound_departure_at,
  outbound_arrival_at
FROM public.trips;

-- Return legs (leg_order = 2)
INSERT INTO public.trip_legs (trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at)
SELECT
  id,
  2,
  destination_airport,
  departure_airport,
  return_airline,
  return_flight_number,
  return_departure_at,
  return_arrival_at
FROM public.trips;

-- Step 4: Drop flat columns from trips (now represented in trip_legs)
ALTER TABLE public.trips
  DROP COLUMN departure_airport,
  DROP COLUMN destination_airport,
  DROP COLUMN outbound_airline,
  DROP COLUMN outbound_flight_number,
  DROP COLUMN outbound_departure_at,
  DROP COLUMN outbound_arrival_at,
  DROP COLUMN return_airline,
  DROP COLUMN return_flight_number,
  DROP COLUMN return_departure_at,
  DROP COLUMN return_arrival_at;

-- Step 5: Index for fast leg lookups by trip
CREATE INDEX trip_legs_trip_id_idx ON public.trip_legs (trip_id, leg_order);

-- Step 6: RLS on trip_legs
ALTER TABLE public.trip_legs ENABLE ROW LEVEL SECURITY;

-- SELECT: accessible if the parent trip is accessible
CREATE POLICY "users can select scoped trip_legs"
  ON public.trip_legs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_legs.trip_id
        AND (
          trips.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.account_links
            WHERE main_user_id    = trips.owner_id
              AND assistant_user_id = auth.uid()
          )
        )
    )
  );

-- INSERT: same scope as parent trip
CREATE POLICY "users can insert scoped trip_legs"
  ON public.trip_legs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_legs.trip_id
        AND (
          trips.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.account_links
            WHERE main_user_id    = trips.owner_id
              AND assistant_user_id = auth.uid()
          )
        )
    )
  );

-- DELETE: same scope (legs can be replaced on edit)
CREATE POLICY "users can delete scoped trip_legs"
  ON public.trip_legs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_legs.trip_id
        AND (
          trips.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.account_links
            WHERE main_user_id    = trips.owner_id
              AND assistant_user_id = auth.uid()
          )
        )
    )
  );
