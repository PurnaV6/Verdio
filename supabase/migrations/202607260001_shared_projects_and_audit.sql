create table if not exists public.organization_projects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id), name text not null, dataset_key text not null,
  storage_path text not null unique, row_count integer not null default 0, health_score integer, quality_score integer,
  status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.organization_audit_events (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id), actor_email text not null,
  event_type text not null, entity_type text not null, entity_id text, metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
alter table public.organization_projects enable row level security;
alter table public.organization_audit_events enable row level security;

create or replace function public.can_edit_organization(target uuid) returns boolean language sql security definer set search_path=public stable as $$
  select exists(select 1 from organization_members where organization_id=target and user_id=auth.uid() and role in ('owner','admin','analyst'))
$$;
create policy "Members view shared projects" on public.organization_projects for select using(public.is_organization_member(organization_id));
create policy "Editors create shared projects" on public.organization_projects for insert with check(public.can_edit_organization(organization_id) and owner_user_id=auth.uid());
create policy "Editors update shared projects" on public.organization_projects for update using(public.can_edit_organization(organization_id));
create policy "Editors delete shared projects" on public.organization_projects for delete using(public.can_edit_organization(organization_id));
create policy "Members view audit events" on public.organization_audit_events for select using(public.is_organization_member(organization_id));

create or replace function public.record_organization_audit(target_organization uuid,target_event text,target_entity_type text,target_entity_id text default null,target_metadata jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare event_id bigint;
begin
  if not public.is_organization_member(target_organization) then raise exception 'Organisation membership required'; end if;
  insert into organization_audit_events(organization_id,actor_user_id,actor_email,event_type,entity_type,entity_id,metadata)
  values(target_organization,auth.uid(),coalesce(auth.jwt()->>'email',''),target_event,target_entity_type,target_entity_id,target_metadata)
  returning id into event_id; return event_id;
end $$;
revoke all on function public.record_organization_audit(uuid,text,text,text,jsonb) from public;
grant execute on function public.record_organization_audit(uuid,text,text,text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('organization-projects','organization-projects',false,52428800,array['application/json'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['application/json'];
create policy "Members read project objects" on storage.objects for select using(bucket_id='organization-projects' and public.is_organization_member(((storage.foldername(name))[1])::uuid));
create policy "Editors upload project objects" on storage.objects for insert with check(bucket_id='organization-projects' and public.can_edit_organization(((storage.foldername(name))[1])::uuid));
create policy "Editors update project objects" on storage.objects for update using(bucket_id='organization-projects' and public.can_edit_organization(((storage.foldername(name))[1])::uuid));
create policy "Editors delete project objects" on storage.objects for delete using(bucket_id='organization-projects' and public.can_edit_organization(((storage.foldername(name))[1])::uuid));

create index if not exists organization_projects_org_updated_idx on public.organization_projects(organization_id,updated_at desc);
create index if not exists organization_audit_org_time_idx on public.organization_audit_events(organization_id,occurred_at desc);
