use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;
use tracing::info;

#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct RegistryRoot {
  pub root: String,
  pub version: Option<String>,
  pub updated_at: Option<String>,
}

pub async fn run_registry_root_loop(
  client: Client,
  root_url: String,
  interval_seconds: u64,
  state: Arc<RwLock<Option<RegistryRoot>>>,
) {
  loop {
    match client.get(&root_url).send().await {
      Ok(resp) if resp.status().is_success() => {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
          let root = body.get("root").and_then(|v| v.as_str()).unwrap_or("").to_string();
          let version = body.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
          let updated_at = body.get("updatedAt").and_then(|v| v.as_str()).map(|s| s.to_string());
          if !root.is_empty() {
            *state.write().await = Some(RegistryRoot { root, version, updated_at });
            info!("updated registry root");
          }
        }
      }
      _ => {}
    }
    sleep(Duration::from_secs(interval_seconds)).await;
  }
}
