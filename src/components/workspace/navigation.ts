export interface NavPage { id: string; label: string; group: string; badge?: string }

export const PAGES: NavPage[] = [
  { id: 'overview', label: 'Executive Workspace', group: 'Decide' },
  { id: 'analyses', label: 'Intelligence', group: 'Decide' },
  { id: 'forecast', label: 'Predictions', group: 'Predict' },
  { id: 'risks', label: 'Risks & Opportunities', group: 'Decide' },
  { id: 'recs', label: 'Decisions', group: 'Decide' },
  { id: 'execution', label: 'Execution', group: 'Decide' },
  { id: 'advisor', label: 'AI Advisor', badge: 'AI', group: 'Predict' },
  { id: 'scenarios', label: 'Scenario Planning', group: 'Predict' },
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
