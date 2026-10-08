export interface NavPage { id: string; label: string; group: string; badge?: string }

export const PAGES: NavPage[] = [
  { id: 'overview', label: 'Executive Workspace', group: 'WORKSPACE' },
  { id: 'analyses', label: 'Intelligence', group: 'INTELLIGENCE' },
  { id: 'forecast', label: 'Predictions', group: 'INTELLIGENCE' },
  { id: 'risks', label: 'Risks & Opportunities', group: 'INTELLIGENCE' },
  { id: 'recs', label: 'Decisions', group: 'INTELLIGENCE' },
  { id: 'execution', label: 'Execution', group: 'WORKSPACE' },
  { id: 'advisor', label: 'AI Advisor', badge: 'AI', group: 'INTELLIGENCE' },
  { id: 'scenarios', label: 'Scenario Planning', group: 'INTELLIGENCE' },
  { id: 'customers', label: 'Customer Intelligence', group: 'EXPLORE' },
  { id: 'seasonality', label: 'Seasonality', group: 'EXPLORE' },
  { id: 'products', label: 'Products & Markets', group: 'EXPLORE' },
  { id: 'health', label: 'Health Detail', group: 'EXPLORE' },
  { id: 'profile', label: 'Data Hub', group: 'DATA' },
  { id: 'connections', label: 'Connections', group: 'DATA' },
  { id: 'relationships', label: 'Data Relationships', group: 'DATA' },
  { id: 'governance', label: 'Governance', group: 'DATA' },
  { id: 'alerts', label: 'Alerts & Reports', group: 'DATA' },
];
