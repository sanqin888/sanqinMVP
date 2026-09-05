export const STAFF_INVITE_DELIVERY = Symbol('STAFF_INVITE_DELIVERY');

export type StaffInviteDeliveryInput = {
  to: string;
  token: string;
  role: string;
  inviterName?: string | null;
  locale?: string;
};

export type StaffInviteDeliveryResult = {
  ok: boolean;
  sendId: string;
  error?: string;
};

export interface StaffInviteDeliveryPort {
  sendStaffInvite(
    input: StaffInviteDeliveryInput,
  ): Promise<StaffInviteDeliveryResult>;
}
