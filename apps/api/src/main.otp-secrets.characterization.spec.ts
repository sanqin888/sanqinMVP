import { readFileSync } from 'fs';
import { join } from 'path';

describe('production OTP secret startup guard characterization', () => {
  it('fails startup when either OTP secret is missing in production', () => {
    const mainSource = readFileSync(join(__dirname, 'main.ts'), 'utf8');
    const guardStart = mainSource.indexOf('const missingOtpSecrets');
    const guardEnd = mainSource.indexOf('app.use(cookieParser', guardStart);
    const productionGuard = mainSource.slice(guardStart, guardEnd);

    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    expect(productionGuard).toContain("!otpSecret ? 'OTP_SECRET' : null");
    expect(productionGuard).toContain(
      "!phoneVerificationSecret ? 'PHONE_VERIFICATION_SECRET' : null",
    );
    expect(productionGuard).toContain('if (missingOtpSecrets.length > 0)');
    expect(productionGuard).toContain('process.exit(1)');
  });
});
