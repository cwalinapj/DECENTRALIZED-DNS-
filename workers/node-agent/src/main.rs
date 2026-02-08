mod cli;
mod config;
mod coordinator;
mod cache;
mod http_server;
mod http_client;
mod keys;
mod receipts;
mod tasks;
mod verify;
#[cfg(test)]
mod tests;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Command};
use config::{load_config, write_default_config, Config};
use coordinator::CoordinatorClient;
use http_server::{build_router, AppState, rate_limiter};
use keys::load_or_generate;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::info;
use tracing_subscriber::EnvFilter;
use tasks::{prefetch::run_prefetch_loop, registry_root::run_registry_root_loop};
use tasks::registry_root::RegistryRoot;

#[tokio::main]
async fn main() -> Result<()> {
  let cli = Cli::parse();
  tracing_subscriber::fmt()
    .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
    .init();

  match cli.command {
    Command::Init { config } => {
      write_default_config(&config)?;
      let cfg = load_config(&config)?;
      let (_keys, material) = load_or_generate(&cfg.data_dir)?;
      info!("created config {}", config);
      info!("public key {}", material.public_key_b64);
      return Ok(());
    }
    Command::VerifyReceipt { receipt } => {
      let raw = std::fs::read_to_string(receipt)?;
      let envelope: receipts::ReceiptEnvelope = serde_json::from_str(&raw)?;
      let ok = receipts::verify_envelope(&envelope)?;
      if ok {
        println!("ok");
      } else {
        println!("invalid");
      }
      return Ok(());
    }
    Command::Run { config } => {
      let cfg = load_config(&config)?;
      run_agent(cfg).await?;
    }
  }

  Ok(())
}

async fn run_agent(config: Config) -> Result<()> {
  let (keys, material) = load_or_generate(&config.data_dir)?;
  let cache = Arc::new(Mutex::new(cache::Cache::new(config.max_cache_items, config.max_cached_bytes)));
  let coordinator = Arc::new(CoordinatorClient::new(config.coordinator_url.clone(), config.request_timeout_ms));
  let limiter = Arc::new(rate_limiter(config.rate_limit_rps));
  let registry_state: Arc<RwLock<Option<RegistryRoot>>> = Arc::new(RwLock::new(None));

  let client = http_client::build_client(config.request_timeout_ms)?;

  let prefetch_cache = cache.clone();
  let prefetch_client = client.clone();
  let prefetch_config = config.clone();
  let prefetch_coordinator = coordinator.clone();
  let prefetch_signing = Arc::new(keys.signing.clone());
  let prefetch_node_id = material.public_key_b64.clone();
  tokio::spawn(async move {
    run_prefetch_loop(
      prefetch_cache,
      prefetch_client,
      prefetch_coordinator,
      prefetch_signing,
      prefetch_node_id,
      prefetch_config.resolver_url.clone(),
      prefetch_config.hot_names.clone(),
      prefetch_config.prefetch_interval_seconds,
      prefetch_config.prefetch_interval_seconds,
    ).await;
  });

  if config.registry.enabled {
    let registry_client = client.clone();
    let registry_url = config.registry.root_url.clone();
    let registry_state = registry_state.clone();
    tokio::spawn(async move {
      run_registry_root_loop(registry_client, registry_url, config.registry.poll_interval_seconds, registry_state).await;
    });
  }

  let state = AppState {
    cache,
    coordinator,
    signing_key: Arc::new(keys.signing),
    node_id: material.public_key_b64,
    limiter,
  };

  let app = build_router(state);
  let listener = tokio::net::TcpListener::bind(&config.listen_addr).await?;
  info!("listening on {}", config.listen_addr);
  axum::serve(listener, app).await?;
  Ok(())
}
