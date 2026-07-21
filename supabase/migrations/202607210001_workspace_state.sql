create table if not exists public.workspace_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 50),
  dataset_key text not null check (char_length(dataset_key) between 1 and 255),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, dataset_key)
);

alter table public.workspace_state enable row level security;

create policy "Users can read their workspace state"
on public.workspace_state for select
using (auth.uid() = user_id);

create policy "Users can create their workspace state"
on public.workspace_state for insert
with check (auth.uid() = user_id);

create policy "Users can update their workspace state"
on public.workspace_state for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their workspace state"
on public.workspace_state for delete
using (auth.uid() = user_id);

create index if not exists workspace_state_user_updated_idx
on public.workspace_state (user_id, updated_at desc);
