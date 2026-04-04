/*
  # Create angle measurements table

  1. New Tables
    - `angle_measurements`
      - `id` (uuid, primary key)
      - `limb_type` (text) - selected limb type (left_arm, right_arm, left_leg, right_leg)
      - `angle` (numeric) - measured angle in degrees
      - `created_at` (timestamp) - when measurement was recorded
  
  2. Security
    - Enable RLS on `angle_measurements` table
    - Add policy for anyone to insert measurements (public table)
    - Add policy for anyone to read all measurements
*/

CREATE TABLE IF NOT EXISTS angle_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  limb_type text NOT NULL,
  angle numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE angle_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anyone to insert measurements"
  ON angle_measurements
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow anyone to read measurements"
  ON angle_measurements
  FOR SELECT
  TO public
  USING (true);
