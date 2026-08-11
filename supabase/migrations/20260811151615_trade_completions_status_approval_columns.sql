ALTER TABLE public.trade_completions
  ADD COLUMN status text NOT NULL DEFAULT 'completed',
  ADD COLUMN approved_at timestamp with time zone,
  ADD COLUMN approved_by uuid REFERENCES users(id);

ALTER TABLE public.trade_completions
  ADD CONSTRAINT trade_completions_status_check
  CHECK (status = ANY (ARRAY['completed'::text, 'pending_approval'::text, 'approved'::text, 'superseded'::text]));
