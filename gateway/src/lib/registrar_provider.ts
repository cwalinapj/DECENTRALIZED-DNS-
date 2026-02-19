import { createMockRegistrar, type RegistrarAdapter } from "./registrar_mock.js";
import { createPorkbunRegistrarAdapter } from "./registrar_porkbun.js";

export type RegistrarProvider = "mock" | "porkbun";

export type RegistrarProviderConfig = {
  enabled: boolean;
  provider: RegistrarProvider;
  dryRun: boolean;
  storePath: string;
  porkbunApiKey?: string;
  porkbunSecretApiKey?: string;
  porkbunEndpoint?: string;
};

export type RegistrarProviderRuntime = {
  adapter: RegistrarAdapter;
  enabled: boolean;
  provider: RegistrarProvider;
  dryRun: boolean;
};

export function parseRegistrarProvider(value?: string): RegistrarProvider {
  const parsed = String(value || "mock").toLowerCase();
  if (parsed === "porkbun") return "porkbun";
  return "mock";
}

function hasPorkbunSecrets(cfg: RegistrarProviderConfig): boolean {
  return Boolean(cfg.porkbunApiKey && cfg.porkbunSecretApiKey);
}

export function createRegistrarProvider(config: RegistrarProviderConfig): RegistrarProviderRuntime {
  if (!config.enabled) {
    return {
      adapter: createMockRegistrar(config.storePath),
      enabled: false,
      provider: "mock",
      dryRun: true
    };
  }

  if (config.provider === "mock") {
    return {
      adapter: createMockRegistrar(config.storePath),
      enabled: true,
      provider: "mock",
      dryRun: true
    };
  }

  const hasSecrets = hasPorkbunSecrets(config);
  if (!config.dryRun && !hasSecrets) {
    throw new Error(
      "registrar_config_error: REGISTRAR_ENABLED=1 requires provider secrets unless REGISTRAR_DRY_RUN=1"
    );
  }

  return {
    adapter: createPorkbunRegistrarAdapter({
      dryRun: config.dryRun || !hasSecrets,
      apiKey: config.porkbunApiKey,
      secretApiKey: config.porkbunSecretApiKey,
      endpoint: config.porkbunEndpoint
    }),
    enabled: true,
    provider: "porkbun",
    dryRun: config.dryRun || !hasSecrets
  };
}
