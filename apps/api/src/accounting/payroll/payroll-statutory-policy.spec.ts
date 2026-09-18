import {
  PAYROLL_STATUTORY_POLICY_CA_ON_2026_01,
  PAYROLL_STATUTORY_POLICY_CA_ON_2026_07,
  selectOntarioPayrollStatutoryPolicy,
} from './payroll-statutory-policy';

describe('Ontario Payroll statutory policy registry', () => {
  it('selects the 122nd edition identity through June 30, 2026', () => {
    expect(
      selectOntarioPayrollStatutoryPolicy(
        new Date('2026-01-01T12:00:00.000Z'),
      )?.version,
    ).toBe('CA-ON-2026-01');
    expect(
      selectOntarioPayrollStatutoryPolicy(
        new Date('2026-06-30T12:00:00.000Z'),
      )?.version,
    ).toBe('CA-ON-2026-01');
  });

  it('selects the 123rd edition identity from July 1, 2026', () => {
    expect(
      selectOntarioPayrollStatutoryPolicy(
        new Date('2026-07-01T12:00:00.000Z'),
      )?.version,
    ).toBe('CA-ON-2026-07');
    expect(
      selectOntarioPayrollStatutoryPolicy(
        new Date('2026-12-31T12:00:00.000Z'),
      )?.version,
    ).toBe('CA-ON-2026-07');
  });

  it('fails closed outside the supported policy calendar', () => {
    expect(
      selectOntarioPayrollStatutoryPolicy(
        new Date('2025-12-31T12:00:00.000Z'),
      ),
    ).toBeNull();
    expect(
      selectOntarioPayrollStatutoryPolicy(
        new Date('2027-01-01T12:00:00.000Z'),
      ),
    ).toBeNull();
    expect(
      selectOntarioPayrollStatutoryPolicy(new Date('invalid')),
    ).toBeNull();
  });

  it('pins the 2026 CPP, EI and Ontario headline constants', () => {
    for (const policy of [
      PAYROLL_STATUTORY_POLICY_CA_ON_2026_01,
      PAYROLL_STATUTORY_POLICY_CA_ON_2026_07,
    ]) {
      expect(policy.cpp.yearlyBasicExemptionCents).toBe(350_000);
      expect(policy.cpp.ympeCents).toBe(7_460_000);
      expect(policy.cpp.yampeCents).toBe(8_500_000);
      expect(policy.cpp.totalRateBasisPoints).toBe(595);
      expect(policy.cpp.maximumTotalContributionCents).toBe(423_045);
      expect(policy.cpp.maximumCpp2ContributionCents).toBe(41_600);

      expect(policy.ei.maximumInsurableEarningsCents).toBe(6_890_000);
      expect(policy.ei.employeeRateBasisPoints).toBe(163);
      expect(policy.ei.maximumEmployeePremiumCents).toBe(112_307);

      expect(policy.ontario.basicPersonalAmountCents).toBe(1_298_900);
      expect(policy.ontario.surtax.firstThresholdCents).toBe(581_800);
      expect(policy.ontario.surtax.secondThresholdCents).toBe(744_600);
    }
  });
});
