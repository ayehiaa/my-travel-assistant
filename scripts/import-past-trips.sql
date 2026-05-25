-- ─────────────────────────────────────────────────────────────────────────────
-- Import 48 past trips from travels.numbers
-- Generated: 2026-05-10
--
-- Run in the Supabase SQL editor or via psql.
-- All trips are round trips, source = manual.
-- Leg 1: LHR → destination (departure date)
-- Leg 2: destination → LHR (re-entry date)
-- days_outside_uk = diff_days - 1 (neither departure nor re-entry day counts)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_trip_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'ayehiaa@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: ayehiaa@gmail.com';
  END IF;

  -- ── 1. Cairo (19 Dec 2021 → 04 Jan 2022) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-01-04'::date - '2021-12-19'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2021-12-19T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2022-01-04T00:00:00.000Z', NULL, now());

  -- ── 2. Milan (04 May 2022 → 08 May 2022) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-05-08'::date - '2022-05-04'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'MXP', NULL, NULL, '2022-05-04T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'MXP', 'LHR', NULL, NULL, '2022-05-08T00:00:00.000Z', NULL, now());

  -- ── 3. Lisbon (10 May 2022 → 15 May 2022) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-05-15'::date - '2022-05-10'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'LIS', NULL, NULL, '2022-05-10T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'LIS', 'LHR', NULL, NULL, '2022-05-15T00:00:00.000Z', NULL, now());

  -- ── 4. Milan (17 May 2022 → 19 May 2022) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-05-19'::date - '2022-05-17'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'MXP', NULL, NULL, '2022-05-17T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'MXP', 'LHR', NULL, NULL, '2022-05-19T00:00:00.000Z', NULL, now());

  -- ── 5. Cairo (22 May 2022 → 25 May 2022) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-05-25'::date - '2022-05-22'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2022-05-22T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2022-05-25T00:00:00.000Z', NULL, now());

  -- ── 6. Paris (25 Jun 2022 → 27 Jun 2022) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-06-27'::date - '2022-06-25'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CDG', NULL, NULL, '2022-06-25T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CDG', 'LHR', NULL, NULL, '2022-06-27T00:00:00.000Z', NULL, now());

  -- ── 7. Cairo (03 Jul 2022 → 08 Aug 2022) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-08-08'::date - '2022-07-03'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2022-07-03T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2022-08-08T00:00:00.000Z', NULL, now());

  -- ── 8. San Francisco (08 Nov 2022 → 11 Nov 2022) ────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2022-11-11'::date - '2022-11-08'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'SFO', NULL, NULL, '2022-11-08T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'SFO', 'LHR', NULL, NULL, '2022-11-11T00:00:00.000Z', NULL, now());

  -- ── 9. Cairo (19 Dec 2022 → 06 Jan 2023) ────────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-01-06'::date - '2022-12-19'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2022-12-19T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2023-01-06T00:00:00.000Z', NULL, now());

  -- ── 10. Berlin (22 Feb 2023 → 24 Feb 2023) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-02-24'::date - '2023-02-22'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2023-02-22T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2023-02-24T00:00:00.000Z', NULL, now());

  -- ── 11. Budapest (16 Mar 2023 → 17 Mar 2023) ────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-03-17'::date - '2023-03-16'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BUD', NULL, NULL, '2023-03-16T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BUD', 'LHR', NULL, NULL, '2023-03-17T00:00:00.000Z', NULL, now());

  -- ── 12. Cairo (29 Jul 2023 → 18 Aug 2023) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-08-18'::date - '2023-07-29'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2023-07-29T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2023-08-18T00:00:00.000Z', NULL, now());

  -- ── 13. Cairo (15 Oct 2023 → 20 Oct 2023) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-10-20'::date - '2023-10-15'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2023-10-15T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2023-10-20T00:00:00.000Z', NULL, now());

  -- ── 14. Madrid (25 Oct 2023 → 27 Oct 2023) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-10-27'::date - '2023-10-25'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'MAD', NULL, NULL, '2023-10-25T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'MAD', 'LHR', NULL, NULL, '2023-10-27T00:00:00.000Z', NULL, now());

  -- ── 15. Berlin (27 Nov 2023 → 29 Nov 2023) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2023-11-29'::date - '2023-11-27'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2023-11-27T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2023-11-29T00:00:00.000Z', NULL, now());

  -- ── 16. Cairo (15 Dec 2023 → 03 Jan 2024) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-01-03'::date - '2023-12-15'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2023-12-15T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2024-01-03T00:00:00.000Z', NULL, now());

  -- ── 17. Berlin (09 Jan 2024 → 11 Jan 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-01-11'::date - '2024-01-09'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2024-01-09T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2024-01-11T00:00:00.000Z', NULL, now());

  -- ── 18. Berlin (04 Mar 2024 → 06 Mar 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-03-06'::date - '2024-03-04'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2024-03-04T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2024-03-06T00:00:00.000Z', NULL, now());

  -- ── 19. Cairo (24 Mar 2024 → 09 Apr 2024) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-04-09'::date - '2024-03-24'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2024-03-24T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2024-04-09T00:00:00.000Z', NULL, now());

  -- ── 20. Berlin (24 Apr 2024 → 26 Apr 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-04-26'::date - '2024-04-24'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2024-04-24T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2024-04-26T00:00:00.000Z', NULL, now());

  -- ── 21. Lisbon (07 May 2024 → 10 May 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-05-10'::date - '2024-05-07'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'LIS', NULL, NULL, '2024-05-07T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'LIS', 'LHR', NULL, NULL, '2024-05-10T00:00:00.000Z', NULL, now());

  -- ── 22. Dublin (23 Jun 2024 → 27 Jun 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-06-27'::date - '2024-06-23'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'DUB', NULL, NULL, '2024-06-23T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'DUB', 'LHR', NULL, NULL, '2024-06-27T00:00:00.000Z', NULL, now());

  -- ── 23. Tirana (09 Jul 2024 → 10 Jul 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-07-10'::date - '2024-07-09'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'TIA', NULL, NULL, '2024-07-09T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'TIA', 'LHR', NULL, NULL, '2024-07-10T00:00:00.000Z', NULL, now());

  -- ── 24. Cairo (03 Aug 2024 → 25 Aug 2024) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-08-25'::date - '2024-08-03'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2024-08-03T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2024-08-25T00:00:00.000Z', NULL, now());

  -- ── 25. San Francisco (18 Sep 2024 → 21 Sep 2024) ───────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-09-21'::date - '2024-09-18'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'SFO', NULL, NULL, '2024-09-18T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'SFO', 'LHR', NULL, NULL, '2024-09-21T00:00:00.000Z', NULL, now());

  -- ── 26. Athens (23 Sep 2024 → 27 Sep 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-09-27'::date - '2024-09-23'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'ATH', NULL, NULL, '2024-09-23T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'ATH', 'LHR', NULL, NULL, '2024-09-27T00:00:00.000Z', NULL, now());

  -- ── 27. Berlin (30 Sep 2024 → 02 Oct 2024) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2024-10-02'::date - '2024-09-30'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2024-09-30T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2024-10-02T00:00:00.000Z', NULL, now());

  -- ── 28. Cairo (31 Jan 2025 → 16 Feb 2025) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-02-16'::date - '2025-01-31'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2025-01-31T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2025-02-16T00:00:00.000Z', NULL, now());

  -- ── 29. Madrid (02 Mar 2025 → 04 Mar 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-03-04'::date - '2025-03-02'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'MAD', NULL, NULL, '2025-03-02T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'MAD', 'LHR', NULL, NULL, '2025-03-04T00:00:00.000Z', NULL, now());

  -- ── 30. Berlin (05 May 2025 → 09 May 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-05-09'::date - '2025-05-05'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-05-05T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-05-09T00:00:00.000Z', NULL, now());

  -- ── 31. Prague (13 May 2025 → 16 May 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-05-16'::date - '2025-05-13'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'PRG', NULL, NULL, '2025-05-13T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'PRG', 'LHR', NULL, NULL, '2025-05-16T00:00:00.000Z', NULL, now());

  -- ── 32. Tirana (19 May 2025 → 21 May 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-05-21'::date - '2025-05-19'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'TIA', NULL, NULL, '2025-05-19T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'TIA', 'LHR', NULL, NULL, '2025-05-21T00:00:00.000Z', NULL, now());

  -- ── 33. Lisbon (26 May 2025 → 30 May 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-05-30'::date - '2025-05-26'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'LIS', NULL, NULL, '2025-05-26T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'LIS', 'LHR', NULL, NULL, '2025-05-30T00:00:00.000Z', NULL, now());

  -- ── 34. Istanbul (09 Jun 2025 → 13 Jun 2025) ────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-06-13'::date - '2025-06-09'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'IST', NULL, NULL, '2025-06-09T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'IST', 'LHR', NULL, NULL, '2025-06-13T00:00:00.000Z', NULL, now());

  -- ── 35. Bucharest (17 Jun 2025 → 21 Jun 2025) ───────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-06-21'::date - '2025-06-17'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'OTP', NULL, NULL, '2025-06-17T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'OTP', 'LHR', NULL, NULL, '2025-06-21T00:00:00.000Z', NULL, now());

  -- ── 36. Istanbul (23 Jun 2025 → 27 Jun 2025) ────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-06-27'::date - '2025-06-23'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'IST', NULL, NULL, '2025-06-23T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'IST', 'LHR', NULL, NULL, '2025-06-27T00:00:00.000Z', NULL, now());

  -- ── 37. Berlin (29 Jun 2025 → 04 Jul 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-07-04'::date - '2025-06-29'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-06-29T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-07-04T00:00:00.000Z', NULL, now());

  -- ── 38. Berlin (25 Aug 2025 → 28 Aug 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-08-28'::date - '2025-08-25'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-08-25T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-08-28T00:00:00.000Z', NULL, now());

  -- ── 39. Berlin (06 Oct 2025 → 09 Oct 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-10-09'::date - '2025-10-06'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-10-06T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-10-09T00:00:00.000Z', NULL, now());

  -- ── 40. Berlin (21 Oct 2025 → 24 Oct 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-10-24'::date - '2025-10-21'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-10-21T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-10-24T00:00:00.000Z', NULL, now());

  -- ── 41. Berlin (28 Oct 2025 → 31 Oct 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-10-31'::date - '2025-10-28'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-10-28T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-10-31T00:00:00.000Z', NULL, now());

  -- ── 42. Istanbul (02 Nov 2025 → 07 Nov 2025) ────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-11-07'::date - '2025-11-02'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'IST', NULL, NULL, '2025-11-02T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'IST', 'LHR', NULL, NULL, '2025-11-07T00:00:00.000Z', NULL, now());

  -- ── 43. Cairo (09 Nov 2025 → 17 Nov 2025) ───────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-11-17'::date - '2025-11-09'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'CAI', NULL, NULL, '2025-11-09T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'CAI', 'LHR', NULL, NULL, '2025-11-17T00:00:00.000Z', NULL, now());

  -- ── 44. Berlin (23 Nov 2025 → 26 Nov 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-11-26'::date - '2025-11-23'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-11-23T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-11-26T00:00:00.000Z', NULL, now());

  -- ── 45. Berlin (30 Nov 2025 → 02 Dec 2025) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2025-12-02'::date - '2025-11-30'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2025-11-30T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2025-12-02T00:00:00.000Z', NULL, now());

  -- ── 46. Berlin (22 Mar 2026 → 26 Mar 2026) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2026-03-26'::date - '2026-03-22'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2026-03-22T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2026-03-26T00:00:00.000Z', NULL, now());

  -- ── 47. Lisbon (05 Apr 2026 → 10 Apr 2026) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2026-04-10'::date - '2026-04-05'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'LIS', NULL, NULL, '2026-04-05T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'LIS', 'LHR', NULL, NULL, '2026-04-10T00:00:00.000Z', NULL, now());

  -- ── 48. Berlin (26 Apr 2026 → 30 Apr 2026) ──────────────────────────────────
  INSERT INTO public.trips (id, owner_id, source, trip_type, days_outside_uk, created_by, last_modified_by, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'manual', 'round_trip', ('2026-04-30'::date - '2026-04-26'::date - 1), v_user_id, v_user_id, now(), now())
  RETURNING id INTO v_trip_id;
  INSERT INTO public.trip_legs (id, trip_id, leg_order, from_airport, to_airport, airline, flight_number, departure_at, arrival_at, created_at) VALUES
    (gen_random_uuid(), v_trip_id, 1, 'LHR', 'BER', NULL, NULL, '2026-04-26T00:00:00.000Z', NULL, now()),
    (gen_random_uuid(), v_trip_id, 2, 'BER', 'LHR', NULL, NULL, '2026-04-30T00:00:00.000Z', NULL, now());

END $$;

COMMIT;
