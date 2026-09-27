import type { Response } from 'express';
import { AccountingInboxArtifactsController } from './accounting-inbox-artifacts.controller';

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

describe('AccountingInboxArtifactsController Uber report delivery', () => {
  it('serves Uber report CSV files as attachments', () => {
    const controller = new AccountingInboxArtifactsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const setHeader = jest.fn();
    const sendFile = jest.fn();
    const res = { setHeader, sendFile } as unknown as Response;

    controller.accountingFile('uber-reports', 'finance.csv', res);

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
    expect(sendFile).toHaveBeenCalledWith(
      expect.stringContaining('uber-reports/finance.csv'),
    );
  });
});
