-- Add reference_date to user_roles for the annual 90-day calculation window
ALTER TABLE user_roles ADD COLUMN reference_date date;
