// Scheduled functions run on published Netlify deploys, not deploy previews.
// The API endpoint verifies CRON_SECRET before it runs any account operation.
export const config = { schedule: '*/15 * * * *' };
export default async () => {
  const base = process.env.APP_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error('PinPilot scheduled worker skipped: APP_URL/URL or CRON_SECRET is missing.');
    return;
  }
  const response = await fetch(`${base.replace(/\/$/, '')}/api/cron/automation`, {
    headers: { Authorization: `Bearer ${secret}` },
    method: 'GET',
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`PinPilot scheduled worker failed (${response.status}): ${body.slice(0, 500)}`);
  console.log(`PinPilot scheduled worker completed: ${body.slice(0, 1000)}`);
};
