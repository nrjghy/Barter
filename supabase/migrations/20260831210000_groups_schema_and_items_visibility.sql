-- Groups feature: base schema (PRD §16 + amendments to §3, §7, §13, §14)
-- Self-serve, user-created, invite-based, user-owned with admin backdoor.
-- No invites/pending-state table: invite is a notification, acceptance
-- inserts directly into group_memberships, matching how connections/
-- giveaway-connections already work in this codebase (immediate action +
-- notification, no intermediate proposal-state table for one-directional
-- invites).

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  creator_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  role text NOT NULL CHECK (role IN ('creator', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE public.item_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, group_id)
);

CREATE INDEX group_memberships_user_id_idx ON public.group_memberships (user_id);
CREATE INDEX group_memberships_group_id_idx ON public.group_memberships (group_id);
CREATE INDEX item_groups_group_id_idx ON public.item_groups (group_id);
CREATE INDEX item_groups_item_id_idx ON public.item_groups (item_id);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_groups ENABLE ROW LEVEL SECURITY;

-- No write policies -- deny-all for direct client writes. All writes go
-- through RPCs (see the RPCs migration below), matching how
-- connections/offers/trade_completions already work in this codebase.

ALTER TABLE public.items ADD COLUMN is_public boolean NOT NULL DEFAULT true;
