-- Make trip_snapshot nullable so non-trip audit actions (expense, portfolio)
-- can be logged without a snapshot.
alter table public.audit_log
  alter column trip_snapshot drop not null;
