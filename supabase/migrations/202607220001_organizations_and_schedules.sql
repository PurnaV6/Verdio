create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null, role text not null check (role in ('owner','admin','analyst','viewer')),
  joined_at timestamptz not null default now(), primary key (organization_id,user_id)
);
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null, role text not null check (role in ('admin','analyst','viewer')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  dataset_key text not null, cadence text not null check (cadence in ('weekly','monthly')),
  recipient_email text not null, active boolean not null default true,
  snapshot jsonb not null default '{}'::jsonb, next_run_at timestamptz,
  last_run_at timestamptz, last_status text, updated_at timestamptz not null default now(),
  unique(user_id,dataset_key)
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.report_schedules enable row level security;

create or replace function public.is_organization_member(target uuid) returns boolean language sql security definer set search_path=public stable as $$ select exists(select 1 from organization_members where organization_id=target and user_id=auth.uid()) $$;
create or replace function public.can_manage_organization(target uuid) returns boolean language sql security definer set search_path=public stable as $$ select exists(select 1 from organization_members where organization_id=target and user_id=auth.uid() and role in ('owner','admin')) $$;

create policy "Members view organizations" on public.organizations for select using (public.is_organization_member(id) or owner_user_id=auth.uid());
create policy "Users create organizations" on public.organizations for insert with check (owner_user_id=auth.uid());
create policy "Owners update organizations" on public.organizations for update using (owner_user_id=auth.uid());
create policy "Members view membership" on public.organization_members for select using (public.is_organization_member(organization_id));
create policy "Owners create first membership" on public.organization_members for insert with check (user_id=auth.uid() and role='owner' and exists(select 1 from organizations o where o.id=organization_id and o.owner_user_id=auth.uid()));
create policy "Managers add membership" on public.organization_members for insert with check (public.can_manage_organization(organization_id));
create policy "Managers update membership" on public.organization_members for update using (public.can_manage_organization(organization_id));
create policy "Managers view invitations" on public.organization_invitations for select using (public.can_manage_organization(organization_id));
create policy "Managers create invitations" on public.organization_invitations for insert with check (public.can_manage_organization(organization_id) and invited_by=auth.uid());
create policy "Managers update invitations" on public.organization_invitations for update using (public.can_manage_organization(organization_id));
create policy "Users manage own schedules" on public.report_schedules for all using (user_id=auth.uid()) with check (user_id=auth.uid());
