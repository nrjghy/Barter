/*
  # Add Reports System

  1. New Tables
    - `reports`
      - `id` (uuid, primary key)
      - `reporter_id` (uuid, references users)
      - `reported_item_id` (uuid, references items)
      - `reported_user_id` (uuid, references users)
      - `reason` (text, predefined categories)
      - `description` (text, optional details)
      - `status` (text, pending/reviewed/resolved)
      - `admin_notes` (text, optional admin comments)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `reports` table
    - Add policies for users to create reports and view their own
    - Add policies for admins to manage all reports

  3. Indexes
    - Index on reported_item_id for fast lookups
    - Index on status for admin filtering
    - Index on created_at for chronological sorting
*/

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN (
    'inappropriate_content',
    'misleading_description',
    'prohibited_item',
    'spam',
    'fake_listing',
    'offensive_language',
    'copyright_violation',
    'safety_concern',
    'other'
  )),
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_item_id ON reports(reported_item_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

-- RLS Policies
CREATE POLICY "Users can create reports"
  ON reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports"
  ON reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Prevent duplicate reports from same user for same item
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_user_item 
  ON reports(reporter_id, reported_item_id) 
  WHERE status IN ('pending', 'reviewed');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_reports_updated_at_trigger ON reports;
CREATE TRIGGER update_reports_updated_at_trigger
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_updated_at();