const REGIONS = ['London', 'North', 'Midlands', 'South West'];
const CATEGORIES = ['Analytics', 'Automation', 'Advisory', 'Support'];
const SEGMENTS = ['Enterprise', 'Mid-market', 'Small business'];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A realistic two-year dataset processed by Verdio's real pipeline. */
export function createSampleBusinessFile(): File {
  const random = seededRandom(20260720);
  const rows: Array<Array<string | number>> = [[
    'Order ID', 'Order Date', 'Product Category', 'Region',
    'Customer Segment', 'Customer ID', 'Revenue', 'Cost', 'Units',
  ]];

  for (let month = 0; month < 24; month += 1) {
    const dateBase = new Date(Date.UTC(2024 + Math.floor(month / 12), month % 12, 1));
    const seasonal = 1 + Math.sin((month / 12) * Math.PI * 2) * 0.08;
    const growth = 1 + month * 0.018;

    for (let order = 0; order < 30; order += 1) {
      const categoryRoll = random();
      const categoryIndex = categoryRoll < 0.36 ? 2 : [0, 1, 3][Math.floor(random() * 3)];
      const segmentIndex = Math.floor(random() * SEGMENTS.length);
      const regionIndex = Math.floor(random() * REGIONS.length);
      const units = 1 + Math.floor(random() * 8);
      const unitPrice = [920, 640, 1180, 390][categoryIndex];
      const segmentFactor = [1.22, 1, 0.78][segmentIndex];
      const variation = 0.88 + random() * 0.26;
      const revenue = Math.round(units * unitPrice * segmentFactor * seasonal * growth * variation);
      const cost = Math.round(revenue * (1 - (0.55 + random() * 0.13)));
      const orderDate = new Date(dateBase);
      orderDate.setUTCDate(1 + Math.floor(random() * 27));
      const customer = 1 + Math.floor(random() * 145);

      rows.push([
        `V-${String(month + 1).padStart(2, '0')}-${String(order + 1).padStart(3, '0')}`,
        orderDate.toISOString().slice(0, 10),
        CATEGORIES[categoryIndex], REGIONS[regionIndex], SEGMENTS[segmentIndex],
        `C-${String(customer).padStart(4, '0')}`,
        revenue, cost, units,
      ]);
    }
  }

  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  return new File([csv], 'Verdio Sample Business.csv', { type: 'text/csv' });
}
