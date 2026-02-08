use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RegistryConfig {
  pub enabled: bool,
  pub root_url: String,
  pub poll_interval_seconds: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
  pub listen_addr: String,
  pub data_dir: String,
  pub coordinator_url: String,
  pub resolver_url: String,
  pub hot_names: Vec<String>,
  pub prefetch_interval_seconds: u64,
  pub request_timeout_ms: u64,
  pub max_cache_items: usize,
  pub max_cached_bytes: usize,
  pub rate_limit_rps: u32,
  pub registry: RegistryConfig,
}

impl Default for Config {
  fn default() -> Self {
    Self {
      listen_addr: "0.0.0.0:8088".to_string(),
      data_dir: "/var/lib/ddns-node".to_string(),
      coordinator_url: "https://your-coordinator.example/receipts".to_string(),
      resolver_url: "https://your-gateway.example/resolve".to_string(),
      hot_names: vec!["example.com".to_string()],
      prefetch_interval_seconds: 60,
      request_timeout_ms: 5000,
      max_cache_items: 5000,
      max_cached_bytes: 1_048_576,
      rate_limit_rps: 10,
      registry: RegistryConfig {
        enabled: false,
        root_url: "https://your-gateway.example/registry/root".to_string(),
        poll_interval_seconds: 60,
      },
    }
  }
}

pub fn load_config(path: &str) -> anyhow::Result<Config> {
  let raw = fs::read_to_string(path)?;
  let config = serde_json::from_str::<Config>(&raw)?;
  Ok(config)
}

pub fn write_default_config(path: &str) -> anyhow::Result<()> {
  let config = Config::default();
  if let Some(parent) = Path::new(path).parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(path, serde_json::to_string_pretty(&config)?)?;
  Ok(())
}
