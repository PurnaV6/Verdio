alter table public.organization_invitations add column if not exists token uuid not null default gen_random_uuid();
alter table public.organization_invitations add column if not exists expires_at timestamptz not null default (now() + interval '7 days');
alter table public.organization_invitations add column if not exists accepted_by uuid references auth.users(id);
create unique index if not exists organization_invitations_token_idx on public.organization_invitations(token);

create or replace function public.accept_organization_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare invitation organization_invitations%rowtype; current_email text;
begin
  current_email := lower(coalesce(auth.jwt()->>'email',''));
  select * into invitation from organization_invitations
  where token=invitation_token and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  if lower(invitation.email)<>current_email then raise exception 'Sign in with the invited email address'; end if;
  insert into organization_members(organization_id,user_id,email,role)
  values(invitation.organization_id,auth.uid(),current_email,invitation.role)
  on conflict(organization_id,user_id) do update set role=excluded.role,email=excluded.email;
  update organization_invitations set status='accepted',accepted_by=auth.uid() where id=invitation.id;
  return invitation.organization_id;
end $$;
revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;

create or replace function public.can_schedule_reports() returns boolean language sql security definer set search_path=public stable as $$
  select not exists(select 1 from organization_members where user_id=auth.uid())
    or exists(select 1 from organization_members where user_id=auth.uid() and role in ('owner','admin'))
$$;
drop policy if exists "Users manage own schedules" on public.report_schedules;
create policy "Authorised users manage own schedules" on public.report_schedules for all
using (user_id=auth.uid() and public.can_schedule_reports())
with check (user_id=auth.uid() and public.can_schedule_reports());
