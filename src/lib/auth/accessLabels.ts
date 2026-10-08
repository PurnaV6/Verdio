import type { OrganizationRole } from './useOrganizationAccess';

/* Plain-language descriptions of what the signed-in role means, for the Trust Center.
   They mirror saveProject() in lib/projects/projectStore.ts: every project is stored on this device,
   and members other than viewers also upload a copy that the rest of the organisation can open. */

const ROLE_LABEL: Record<OrganizationRole, string> = {
  owner: 'Organisation owner',
  admin: 'Organisation admin',
  analyst: 'Analyst',
  viewer: 'Viewer (read-only)',
};

export function accessLevelLabel(role: OrganizationRole | null, loading: boolean): string {
  if (loading) return 'Checking your access…';
  return role ? ROLE_LABEL[role] : 'Individual workspace (not part of an organisation)';
}

export function projectStorageLabel(role: OrganizationRole | null, loading: boolean): string {
  if (loading) return 'Checking where saved projects are kept…';
  if (!role) return 'Saved projects stay in this browser (IndexedDB on this device) and are not shared.';
  if (role === 'viewer') return 'Saved projects stay in this browser (IndexedDB on this device). Viewers cannot save projects to the organisation, but can open projects shared by its members.';
  return 'Saved projects are kept in this browser (IndexedDB on this device). Saving while signed in also uploads a copy to your organisation, where its members can open it.';
}
