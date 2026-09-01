import { apiFetch } from './client';

export type AdminPosDeviceView = {
  deviceStableId: string;
  storeStableId: string;
  name: string | null;
  status: 'ACTIVE' | 'DISABLED';
  enrolledAt: string;
  lastSeenAt: string | null;
};

export type AdminPosDeviceEnrollmentView = AdminPosDeviceView & {
  enrollmentCode: string;
};

export function fetchAdminPosDevices(
  storeStableId: string,
): Promise<AdminPosDeviceView[]> {
  return apiFetch<AdminPosDeviceView[]>(
    `/admin/pos-devices?storeStableId=${encodeURIComponent(storeStableId)}`,
  );
}

export function createAdminPosDevice(input: {
  storeStableId: string;
  name: string;
}): Promise<AdminPosDeviceEnrollmentView> {
  return apiFetch<AdminPosDeviceEnrollmentView>('/admin/pos-devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function resetAdminPosDeviceEnrollment(
  deviceStableId: string,
): Promise<AdminPosDeviceEnrollmentView> {
  return apiFetch<AdminPosDeviceEnrollmentView>(
    `/admin/pos-devices/${encodeURIComponent(deviceStableId)}/reset-code`,
    { method: 'PATCH' },
  );
}

export function updateAdminPosDeviceStatus(
  deviceStableId: string,
  status: AdminPosDeviceView['status'],
): Promise<AdminPosDeviceView> {
  return apiFetch<AdminPosDeviceView>(
    `/admin/pos-devices/${encodeURIComponent(deviceStableId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  );
}

export function deleteAdminPosDevice(deviceStableId: string): Promise<{
  deviceStableId: string;
}> {
  return apiFetch<{ deviceStableId: string }>(
    `/admin/pos-devices/${encodeURIComponent(deviceStableId)}`,
    { method: 'DELETE' },
  );
}
