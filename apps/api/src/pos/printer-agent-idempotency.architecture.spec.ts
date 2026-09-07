import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');
const AGENT_PATH = resolve(
  REPO_ROOT,
  'tools',
  'printer-server',
  'printer-server.js',
);
const GATEWAY_PATH = resolve(__dirname, 'pos.gateway.ts');
const LABEL_SCRIPT_PATH = resolve(
  REPO_ROOT,
  'tools',
  'printer-server',
  'print-label.ps1',
);

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('POS printer dispatch idempotency boundary', () => {
  it('keeps database row-lock dispatch/ACK ownership in the Print gateway', () => {
    const gateway = read(GATEWAY_PATH);

    expect(gateway).toContain('FOR UPDATE');
    expect(gateway).toContain("status !== 'PENDING' && status !== 'FAILED'");
    expect(gateway).toContain("existingJob[`${target}Status`] === 'COMPLETED'");
    expect(gateway).toContain('recoverStaleDelivered');
    expect(gateway).toContain("[`${target}Status`]: 'DELIVERED'");
    expect(gateway).toContain("[`${target}FailureReason`]: 'ACK_TIMEOUT'");
    const dispatch = gateway.slice(
      gateway.indexOf('private async dispatchTarget'),
      gateway.indexOf('private async markTimeoutAndRetry'),
    );
    expect(dispatch.indexOf("[`${target}Status`]: 'DELIVERED'")).toBeLessThan(
      dispatch.indexOf(".emit('PRINT_JOB'"),
    );
  });

  it('keeps the Windows printer agent idempotent by stable jobId + target without changing the wire envelope', () => {
    const agent = read(AGENT_PATH);

    expect(agent).toContain('.sanq-printer-completed-jobs.json');
    expect(agent).toContain('printDeliveryKey(jobId, target)');
    expect(agent).toContain('completedPrintDeliveries.has(deliveryKey)');
    expect(agent).toContain('inFlightPrintDeliveries.get(deliveryKey)');
    expect(agent).toContain('rememberCompletedPrintDelivery(jobId, target)');
    expect(agent).toContain(
      'fs.renameSync(tempFile, POS_PRINT_COMPLETION_FILE)',
    );
    expect(agent).toContain('socket.on("PRINT_JOB"');
    expect(agent).toContain('socket.emit("PRINT_JOB_ACK"');
    expect(agent).not.toContain('deliveryId');
  });

  it('renders the label pickup code centered instead of exposing the Order stable id', () => {
    const agent = read(AGENT_PATH);
    const labelScript = read(LABEL_SCRIPT_PATH);

    expect(agent).toContain('formattedPayload.pickupCode');
    expect(agent).toContain('pickupCode: String(pickupCode || "")');
    expect(labelScript).toContain('$pickupCode = Resolve-Text $payload.pickupCode');
    expect(labelScript).toContain(
      '$pickupFormat.Alignment = [System.Drawing.StringAlignment]::Center',
    );
    expect(labelScript).toContain(
      '$graphics.DrawString("#$pickupCode", $pickupFont, $brush, $pickupRect, $pickupFormat)',
    );
    expect(labelScript).not.toContain(
      '$graphics.DrawString("#$orderNumber", $orderFont',
    );
  });
});
