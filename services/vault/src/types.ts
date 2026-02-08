export type VaultEntry = {
  wallet_id: string;
  entry_id: string;
  type: string;
  ciphertext: string;
  key_id: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  rotated_at?: string;
};

export type VaultConfig = {
  vaultDir: string;
  allowUnauthenticated: boolean;
  authToken: string;
  maxBodyBytes: number;
};
