-- =============================================================
-- Window Quote Pro — Stage 1.2 Cloud Persistence Migration
-- Run this ONCE in the Supabase SQL Editor (or via CLI)
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Extend the `jobs` table with payment tracking columns
-- ---------------------------------------------------------------
-- These columns store payment state directly on the job row,
-- consistent with the existing accepted_at / started_at / completed_at pattern.
-- RLS is inherited automatically from the existing jobs table policies.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS payment_status  TEXT         NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method  TEXT,
  ADD COLUMN IF NOT EXISTS payment_notes   TEXT;

-- Add a check constraint to keep payment_status values clean
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_payment_status_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_payment_status_check
  CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid'));

-- ---------------------------------------------------------------
-- 2. Extend the `team_settings` table with a logo URL column
-- ---------------------------------------------------------------
-- Stores the Supabase Storage public URL for the team logo.
-- RLS is inherited from the existing team_settings policies.

ALTER TABLE public.team_settings
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ---------------------------------------------------------------
-- 3. Create the `logos` Supabase Storage bucket (public read)
-- ---------------------------------------------------------------
-- Files are stored at path: {team_id}/logo.{ext}
-- The bucket is public so all team members can render logos in PDFs
-- without needing an authenticated download URL.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,  -- 2 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

-- ---------------------------------------------------------------
-- 4. Storage RLS policies for the `logos` bucket
-- ---------------------------------------------------------------
-- NOTE: The subquery references `public.team_members` which is the
-- table used by the existing get_my_team RPC. If your schema uses
-- a different table name (e.g. `team_memberships`), update accordingly.

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Team owner can upload logo"  ON storage.objects;
DROP POLICY IF EXISTS "Team owner can delete logo"  ON storage.objects;
DROP POLICY IF EXISTS "Team owner can update logo"  ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read logos"        ON storage.objects;

-- Public read (all team members + unauthenticated for PDF rendering)
CREATE POLICY "Anyone can read logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'logos');

-- Owner upload
CREATE POLICY "Team owner can upload logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT team_id::text
      FROM public.team_members
      WHERE user_id = auth.uid()
        AND role = 'owner'
      LIMIT 1
    )
  );

-- Owner update (overwrite existing logo)
CREATE POLICY "Team owner can update logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT team_id::text
      FROM public.team_members
      WHERE user_id = auth.uid()
        AND role = 'owner'
      LIMIT 1
    )
  );

-- Owner delete
CREATE POLICY "Team owner can delete logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT team_id::text
      FROM public.team_members
      WHERE user_id = auth.uid()
        AND role = 'owner'
      LIMIT 1
    )
  );

-- ---------------------------------------------------------------
-- 5. Backfill: set amount_due = quoted_price for ALL unpaid jobs
-- ---------------------------------------------------------------
-- Ensures every unpaid job has amount_due = quoted_price.
-- This covers jobs in any status (quoted, accepted, scheduled,
-- in_progress, completed) that were inserted before this migration
-- ran and therefore have amount_due = 0 (the column default).

UPDATE public.jobs
SET amount_due = COALESCE(quoted_price, 0)
WHERE payment_status = 'unpaid'
  AND amount_due = 0
  AND COALESCE(quoted_price, 0) > 0;

-- ---------------------------------------------------------------
-- Done. Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'jobs' AND column_name LIKE 'payment%'
--   OR column_name IN ('amount_paid','amount_due','paid_at');
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'team_settings' AND column_name = 'logo_url';
--
--   SELECT id, name, public FROM storage.buckets WHERE id = 'logos';
-- =============================================================
