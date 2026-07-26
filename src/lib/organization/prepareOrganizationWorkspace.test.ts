import { describe, expect, it } from 'vitest';
import { prepareOrganizationWorkspace } from './prepareOrganizationWorkspace';

function csv(name: string, content: string) {
  return new File([content], name, { type: 'text/csv' });
}

describe('prepareOrganizationWorkspace', () => {
  it('builds evidence-backed inventory and demand indicators', async () => {
    const sales = csv(
      'sales.csv',
      'date,product id,quantity,revenue\n2026-01-01,SKU-1,10,100\n2026-01-02,SKU-2,5,75\n',
    );
    const inventory = csv(
      'inventory.csv',
      'product id,inventory\nSKU-1,4\nSKU-2,20\n',
    );

    const workspace = await prepareOrganizationWorkspace([sales, inventory]);
    const coverage = workspace.context.metrics.find(metric=>metric.id==='inventory-demand-coverage');
    const exposure = workspace.context.metrics.find(metric=>metric.id==='products-requiring-review');
    const recommendation = workspace.context.insights.find(insight=>insight.id==='inventory-review');

    expect(workspace.context.datasets).toHaveLength(2);
    expect(workspace.context.relationships.length).toBeGreaterThan(0);
    expect(coverage?.value).toBeCloseTo(160, 4);
    expect(exposure?.value).toBe(1);
    expect(recommendation?.description).toContain('1 of 2 matched products');
    expect(recommendation?.action).toContain('lead times');
  });

  it('does not invent cross-dataset metrics when no supported join exists', async () => {
    const sales = csv('sales.csv', 'date,product id,quantity,revenue\n2026-01-01,SKU-1,10,100\n');
    const finance = csv('finance.csv', 'ledger code,cost\nL-1,40\n');

    const workspace = await prepareOrganizationWorkspace([sales, finance]);

    expect(workspace.context.metrics.some(metric=>metric.id==='inventory-demand-coverage')).toBe(false);
    expect(workspace.context.metrics.some(metric=>metric.id==='connected-revenue')).toBe(true);
  });
});
