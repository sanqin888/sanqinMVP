export const CUSTOMER_ADMINISTRATION = Symbol('CUSTOMER_ADMINISTRATION');

export type CustomerAdminProfileUpdateInput = {
  userStableId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  birthdayYear?: number | null;
  birthdayMonth?: number | null;
};

export type CustomerAdminProfileDto = {
  userStableId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthdayYear: number | null;
  birthdayMonth: number | null;
  phoneVerifiedAt?: string | null;
};

export type CustomerAddressDto = {
  addressStableId: string;
  label: string;
  receiver: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  remark: string;
  city: string;
  province: string;
  postalCode: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
};

export interface CustomerAdministrationPort {
  updateProfileAsAdmin(
    input: CustomerAdminProfileUpdateInput,
  ): Promise<CustomerAdminProfileDto>;
  listAddressesAsAdmin(input: {
    userStableId: string;
  }): Promise<CustomerAddressDto[]>;
}
