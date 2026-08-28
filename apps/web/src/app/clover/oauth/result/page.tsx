type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const firstValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const failureMessages: Record<string, string> = {
  CONFIGURATION_ERROR: 'Clover connection is not configured on the server.',
  INVALID_LAUNCH: 'The Clover launch request was invalid.',
  INVALID_STATE: 'The authorization session was invalid.',
  EXPIRED_STATE: 'The authorization session expired. Please launch sanq.ca from Clover again.',
  STATE_REPLAYED: 'This authorization session has already been used.',
  USER_DENIED: 'Clover authorization was cancelled.',
  PROVIDER_ERROR: 'Clover could not complete the authorization request.',
  MISSING_CODE: 'Clover did not return an authorization code.',
  MERCHANT_MISMATCH: 'The authorized Clover merchant did not match the launch request.',
  PAYMENTS_PERMISSION_MISSING: 'The Clover authorization cannot read payments.',
  STORE_MAPPING_CONFLICT: 'The Clover merchant could not be safely linked to this SanQ store.',
  TOKEN_EXCHANGE_FAILED: 'The Clover authorization code could not be exchanged.',
  TEMPORARY_FAILURE: 'A temporary connection error occurred. Please try again from Clover.',
};

export default async function CloverOAuthResultPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const success = firstValue(params.status) === 'success';
  const merchant = firstValue(params.merchant);
  const storeStableId = firstValue(params.storeStableId);
  const binding = firstValue(params.binding);
  const reason = firstValue(params.reason) ?? 'TEMPORARY_FAILURE';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#f7f2e8',
        color: '#241f19',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '20px',
          background: '#fffdf8',
          padding: '32px',
          boxShadow: '0 18px 50px rgba(42, 34, 24, 0.10)',
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: '28px' }}>
          {success ? 'Clover connection successful.' : 'Clover connection failed.'}
        </h1>
        {success ? (
          <>
            {merchant ? (
              <p>
                <strong>Merchant:</strong> {merchant}
              </p>
            ) : null}
            {storeStableId ? (
              <p>
                <strong>SanQ store:</strong> {storeStableId}
              </p>
            ) : null}
            {binding === 'PENDING_BINDING' ? (
              <p>
                Authorization was saved, but this Clover merchant still requires an administrator store binding before it can be used for SanQ payment reads.
              </p>
            ) : null}
            <p>You may close this page.</p>
          </>
        ) : (
          <>
            <p>{failureMessages[reason] ?? failureMessages.TEMPORARY_FAILURE}</p>
            <p>No payment or credential information was displayed.</p>
          </>
        )}
      </section>
    </main>
  );
}
