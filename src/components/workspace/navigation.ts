import { Home, Sparkles, BarChart3, ShieldAlert, Brain, CheckCircle, Layers, TrendingUp, Users, Package, Activity, Plug, Bell, SlidersHorizontal, ShieldCheck, Network, ClipboardCheck } from "lucide-react";

export const PAGES = [
  { id: 'overview', label: 'Executive Workspace', icon: Home, group: 'WORKSPACE' },
  { id: 'analyses', label: 'Intelligence', icon: BarChart3, group: 'INTELLIGENCE' },
  { id: 'forecast', label: 'Predictions', icon: TrendingUp, group: 'INTELLIGENCE' },
  { id: 'risks', label: 'Risks & Opportunities', icon: ShieldAlert, group: 'INTELLIGENCE' },
  { id: 'recs', label: 'Decisions', icon: Brain, group: 'INTELLIGENCE' },
  { id: 'execution', label: 'Execution', icon: ClipboardCheck, group: 'WORKSPACE' },
  { id: 'advisor', label: 'AI Advisor', icon: Sparkles, badge: 'AI', group: 'INTELLIGENCE' },
  { id: 'scenarios', label: 'Scenario Planning', icon: SlidersHorizontal, group: 'INTELLIGENCE' },
  { id: 'customers', label: 'Customer Intelligence', icon: Users, group: 'EXPLORE' },
  { id: 'seasonality', label: 'Seasonality', icon: Activity, group: 'EXPLORE' },
  { id: 'products', label: 'Products & Markets', icon: Package, group: 'EXPLORE' },
  { id: 'health', label: 'Health Detail', icon: CheckCircle, group: 'EXPLORE' },
  { id: 'profile', label: 'Data Hub', icon: Layers, group: 'DATA' },
  { id: 'connections', label: 'Connections', icon: Plug, group: 'DATA' },
  { id: 'relationships', label: 'Data Relationships', icon: Network, group: 'DATA' },
  { id: 'governance', label: 'Governance', icon: ShieldCheck, group: 'DATA' },
  { id: 'alerts', label: 'Alerts & Reports', icon: Bell, group: 'DATA' },
];
