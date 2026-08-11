/**
 * Opt-in, read-only Uber sandbox probe. Never include secret values in matcher
 * messages, snapshots, logs or test names.
 */
const enabled = process.env.UBER_SANDBOX_SMOKE === '1';
const smoke = enabled ? describe : describe.skip;

smoke('Uber sandbox read-only smoke', () => {
  it('obtains a token and reads store resources without mutation', async () => {
    const clientId = process.env.UBER_SANDBOX_CLIENT_ID;
    const clientSecret = process.env.UBER_SANDBOX_CLIENT_SECRET;
    const storeId = process.env.UBER_SANDBOX_STORE_ID;
    const tokenUrl =
      process.env.UBER_SANDBOX_TOKEN_URL ||
      'https://auth.uber.com/oauth/v2/token';
    const apiUrl = process.env.UBER_SANDBOX_API_URL || 'https://api.uber.com';
    if (!clientId || !clientSecret || !storeId)
      throw new Error(
        'Sandbox smoke enabled without the three dedicated UBER_SANDBOX credentials',
      );

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'eats.store',
      }),
    });
    if (!tokenResponse.ok)
      throw new Error(`Sandbox token probe failed (${tokenResponse.status})`);
    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: unknown;
    };
    if (
      typeof tokenPayload.access_token !== 'string' ||
      !tokenPayload.access_token
    )
      throw new Error('Sandbox token response omitted access_token');

    const headers = {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: 'application/json',
    };
    for (const path of [
      '/v1/eats/stores',
      `/v1/eats/stores/${encodeURIComponent(storeId)}`,
    ]) {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
        method: 'GET',
        headers,
      });
      if (!response.ok)
        throw new Error(`Sandbox read-only probe failed (${response.status})`);
    }
  }, 30_000);
});
