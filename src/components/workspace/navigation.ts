export interface NavPage { id: string; label: string; group: string; badge?: string }

// Groups follow the original Verd.io navigation: Workspace, Intelligence, Explore, Data.
export const PAGES: NavPage[] = [
  { id: 'overview', label: 'Executive Workspace', group: 'Workspace' },
  { id: 'analyses', label: 'Intelligence', group: 'Intelligence' },
  { id: 'forecast', label: 'Predictions', group: 'Intelligence' },
  { id: 'risks', label: 'Risks & Opportunities', group: 'Intelligence' },
  { id: 'recs', label: 'Decisions', group: 'Intelligence' },
  { id: 'execution', label: 'Execution', group: 'Workspace' },
  { id: 'advisor', label: 'AI Advisor', badge: 'AI', group: 'Intelligence' },
  { id: 'scenarios', label: 'Scenario Planning', group: 'Intelligence' },
  { id: 'customers', label: 'Customer Intelligence', group: 'Explore' },
  { id: 'seasonality', label: 'Seasonality', group: 'Explore' },
  { id: 'products', label: 'Products & Markets', group: 'Explore' },
  { id: 'health', label: 'Health Detail', group: 'Explore' },
  { id: 'profile', label: 'Data Hub', group: 'Data' },
  { id: 'connections', label: 'Connections', group: 'Data' },
  { id: 'relationships', label: 'Data Relationships', group: 'Data' },
  { id: 'governance', label: 'Governance', group: 'Data' },
  { id: 'alerts', label: 'Alerts & Reports', group: 'Data' },
];

/** The canonical visible name for a page: the header title, the navigation label and the page heading all use this. */
export function pageLabel(id: string): string {
  return PAGES.find(page => page.id === id)?.label ?? id;
}
