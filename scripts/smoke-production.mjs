const base = (process.argv[2] || process.env.VERDIO_BASE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('Provide a deployment URL: npm run smoke -- https://deployment.example.com');

const checks = [
  ['homepage', '/', response => response.ok && response.headers.get('content-type')?.includes('text/html')],
  ['application route', '/app?auth=signin', response => response.ok && response.headers.get('content-type')?.includes('text/html')],
  ['API liveness', '/api/health', response => response.ok && response.headers.get('content-type')?.includes('application/json')],
];

let failed = false;
for (const [name, path, valid] of checks) {
  try {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
    const passed = Boolean(valid(response));
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (${response.status})`);
    failed ||= !passed;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name} (${error?.name || 'request error'})`);
  }
}
if (failed) process.exitCode = 1;
