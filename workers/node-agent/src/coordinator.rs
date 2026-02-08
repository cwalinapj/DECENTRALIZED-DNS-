use crate::receipts::ReceiptEnvelope;
use reqwest::StatusCode;
use std::time::Duration;
use tokio::time::sleep;
use tracing::warn;

pub struct CoordinatorClient {
  client: reqwest::Client,
  pub coordinator_url: String,
}

impl CoordinatorClient {
  pub fn new(coordinator_url: String, timeout_ms: u64) -> Self {
    let client = reqwest::Client::builder()
      .timeout(Duration::from_millis(timeout_ms))
      .build()
      .expect("client build");
    Self { client, coordinator_url }
  }

  pub async fn post_receipt(&self, envelope: &ReceiptEnvelope) -> anyhow::Result<()> {
    let mut attempt = 0u32;
    loop {
      let res = self.client.post(&self.coordinator_url)
        .json(envelope)
        .send()
        .await;
      match res {
        Ok(resp) if resp.status().is_success() => return Ok(()),
        Ok(resp) if resp.status() == StatusCode::TOO_MANY_REQUESTS => {
          let retry = retry_after_ms(&resp).unwrap_or(backoff_ms(attempt));
          warn!("rate_limited retry_in_ms={}", retry);
          sleep(Duration::from_millis(retry)).await;
        }
        Ok(resp) => {
          let status = resp.status();
          let body = resp.text().await.unwrap_or_default();
          warn!("receipt rejected status={} body={}", status, body);
          sleep(Duration::from_millis(backoff_ms(attempt))).await;
        }
        Err(err) => {
          warn!("receipt post error: {}", err);
          sleep(Duration::from_millis(backoff_ms(attempt))).await;
        }
      }
      attempt += 1;
      if attempt > 6 {
        return Ok(());
      }
    }
  }
}

fn retry_after_ms(resp: &reqwest::Response) -> Option<u64> {
  resp.headers().get("retry-after").and_then(|val| val.to_str().ok()).and_then(|text| {
    text.parse::<u64>().ok().map(|sec| sec * 1000)
  })
}

fn backoff_ms(attempt: u32) -> u64 {
  let base = 500u64;
  let max = 30_000u64;
  let pow = 2u64.saturating_pow(attempt.min(6));
  (base * pow).min(max)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn backoff_caps() {
    assert_eq!(backoff_ms(0), 500);
    assert!(backoff_ms(10) <= 30_000);
  }
}
