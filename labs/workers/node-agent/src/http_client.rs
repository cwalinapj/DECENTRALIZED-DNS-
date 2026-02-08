use reqwest::Client;
use std::time::Duration;

pub fn build_client(timeout_ms: u64) -> anyhow::Result<Client> {
  Ok(Client::builder()
    .timeout(Duration::from_millis(timeout_ms))
    .build()?)
}
