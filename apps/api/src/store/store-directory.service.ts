import { Inject, Injectable } from '@nestjs/common';
import {
  STORE_DIRECTORY_READER,
  STORE_DIRECTORY_WRITER,
  StoreStableIdAlreadyExistsError,
  type StoreConfigSnapshot,
  type StoreDirectoryEntry,
  type StoreDirectoryReaderPort,
  type StoreDirectoryWriterPort,
} from './brand-store-config.contract';

export class InvalidStoreDirectoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStoreDirectoryInputError';
  }
}

@Injectable()
export class StoreDirectoryService {
  constructor(
    @Inject(STORE_DIRECTORY_READER)
    private readonly reader: StoreDirectoryReaderPort,
    @Inject(STORE_DIRECTORY_WRITER)
    private readonly writer: StoreDirectoryWriterPort,
  ) {}

  listStores(): Promise<StoreDirectoryEntry[]> {
    return this.reader.listStores();
  }

  async createStore(input: {
    storeName: string;
    storeStableId: string;
  }): Promise<StoreConfigSnapshot> {
    const storeName = input.storeName.trim();
    const storeStableId = input.storeStableId.trim();

    if (!storeName || storeName.length > 120) {
      throw new InvalidStoreDirectoryInputError(
        'storeName must be a non-empty string up to 120 characters',
      );
    }
    if (
      !storeStableId ||
      storeStableId.length > 80 ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(storeStableId)
    ) {
      throw new InvalidStoreDirectoryInputError(
        'storeStableId must start with a letter or number and contain only letters, numbers, _ or -',
      );
    }

    const duplicate = (await this.reader.listStores()).some(
      (store) =>
        store.storeStableId.toLowerCase() === storeStableId.toLowerCase(),
    );
    if (duplicate) {
      throw new StoreStableIdAlreadyExistsError(storeStableId);
    }

    return this.writer.createStore({ storeName, storeStableId });
  }
}
