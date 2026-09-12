import { Prisma } from '@prisma/client';
import { runSerializableAccountingWrite } from './accounting-atomic-write';

describe('runSerializableAccountingWrite', () => {
  const tx = {} as Prisma.TransactionClient;

  it('uses Serializable isolation for the accounting write unit', async () => {
    const transaction = jest.fn(
      (
        work: (client: Prisma.TransactionClient) => Promise<string>,
        options: { isolationLevel: Prisma.TransactionIsolationLevel },
      ) => {
        expect(options).toEqual({
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        return work(tx);
      },
    );
    const work = jest.fn().mockResolvedValue('ok');

    await expect(
      runSerializableAccountingWrite(
        { $transaction: transaction } as never,
        work,
      ),
    ).resolves.toBe('ok');
    expect(work).toHaveBeenCalledWith(tx);
  });

  it('retries Prisma P2034 serialization conflicts and re-runs the whole write unit', async () => {
    let attempt = 0;
    const transaction = jest.fn(
      (work: (client: Prisma.TransactionClient) => Promise<string>) => {
        attempt += 1;
        if (attempt === 1) {
          throw Object.assign(new Error('serialization conflict'), {
            code: 'P2034',
          });
        }
        return work(tx);
      },
    );
    const work = jest.fn().mockResolvedValue('committed');

    await expect(
      runSerializableAccountingWrite(
        { $transaction: transaction } as never,
        work,
      ),
    ).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-serialization failures', async () => {
    const failure = new Error('audit write failed');
    const transaction = jest.fn().mockRejectedValue(failure);
    const work = jest.fn().mockResolvedValue('unused');

    await expect(
      runSerializableAccountingWrite(
        { $transaction: transaction } as never,
        work,
      ),
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  it('stops after three P2034 attempts and returns the final transaction error', async () => {
    const failure = Object.assign(new Error('serialization conflict'), {
      code: 'P2034',
    });
    const transaction = jest.fn().mockRejectedValue(failure);
    const work = jest.fn().mockResolvedValue('unused');

    await expect(
      runSerializableAccountingWrite(
        { $transaction: transaction } as never,
        work,
      ),
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(work).not.toHaveBeenCalled();
  });
});
