export interface StorageResult {
  key: string;
  url?: string;
}

export interface StorageBackend {
  name: string;
  putObject(key: string, data: Buffer, contentType?: string): Promise<StorageResult>;
}
