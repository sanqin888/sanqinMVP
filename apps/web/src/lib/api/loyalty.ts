import { apiFetch } from "@/lib/api/client";

export type LoyaltyTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

export type LoyaltyPolicySettingsDto = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierMultiplierBronze: number;
  tierMultiplierSilver: number;
  tierMultiplierGold: number;
  tierMultiplierPlatinum: number;
  tierThresholdSilver: number;
  tierThresholdGold: number;
  tierThresholdPlatinum: number;
};

export type LoyaltyPolicySnapshotDto = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierThresholdCents: Record<Exclude<LoyaltyTier, "BRONZE">, number>;
  tierMultipliers: Record<LoyaltyTier, number>;
};

export async function fetchAdminLoyaltyPolicySettings() {
  return apiFetch<LoyaltyPolicySettingsDto>("/admin/benefits/loyalty-policy");
}

export async function updateAdminLoyaltyPolicySettings(
  input: LoyaltyPolicySettingsDto,
) {
  return apiFetch<LoyaltyPolicySettingsDto>("/admin/benefits/loyalty-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchPosLoyaltyPolicy() {
  return apiFetch<LoyaltyPolicySnapshotDto>("/pos/loyalty-policy");
}
