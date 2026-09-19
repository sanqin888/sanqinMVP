export type AccountingAuditLog = {
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  operatorActorRef: string;
  createdAt: string;
};

export type AccountingAuditLogQuery = {
  entityType?: string;
  entityId?: string;
  operatorActorRef?: string;
  from?: string;
  to?: string;
};
