use crate::{cache::Cache, receipts::{hash_response, Receipt, ReceiptRequest, sign_receipt}};
use crate::coordinator::CoordinatorClient;
use crate::verify::{verify_proof, ProofStep};
use ed25519_dalek::SigningKey;
use reqwest::Client;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{info, warn};

pub async fn run_prefetch_loop(
  cache: Arc<Mutex<Cache>>,
  client: Client,
  coordinator: Arc<CoordinatorClient>,
  signing_key: Arc<SigningKey>,
  node_id: String,
  resolver_url: String,
  hot_names: Vec<String>,
  interval_seconds: u64,
  ttl_seconds: u64,
) {
  loop {
    for name in &hot_names {
      let url = format!("{}?name={}", resolver_url, name);
      match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
          if let Ok(body) = resp.text().await {
            if !should_cache_response(&body) {
              warn!("skipping unverified response for {}", name);
              continue;
            }
            let result_hash = hash_response(&body);
            let mut cache_lock = cache.lock().await;
            cache_lock.set(
              name.clone(),
              body.clone(),
              Duration::from_secs(ttl_seconds),
              result_hash.clone(),
            );
            info!("cached {}", name);
            let receipt = Receipt {
              receipt_type: "VERIFY".to_string(),
              node_id: node_id.clone(),
              ts: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
              request: Some(ReceiptRequest { name: name.clone() }),
              result_hash: Some(result_hash),
              bytes: Some(body.len() as u64),
              details: None,
            };
            if let Ok(env) = sign_receipt(&signing_key, receipt) {
              let coordinator_clone = coordinator.clone();
              tokio::spawn(async move {
                let _ = coordinator_clone.post_receipt(&env).await;
              });
            }
          }
        }
        _ => {}
      }
    }
    sleep(Duration::from_secs(interval_seconds)).await;
  }
}

fn should_cache_response(body: &str) -> bool {
  let value: serde_json::Value = match serde_json::from_str(body) {
    Ok(v) => v,
    Err(_) => return false,
  };
  let metadata = match value.get("metadata") {
    Some(v) => v,
    None => return true,
  };
  let proof = metadata.get("proof");
  if proof.is_none() {
    return true;
  }
  let proof = proof.unwrap();
  let root = proof.get("root").and_then(|v| v.as_str());
  let leaf = proof.get("leaf").and_then(|v| v.as_str());
  let proof_steps = proof.get("proof");
  if root.is_none() || leaf.is_none() || proof_steps.is_none() {
    return false;
  }
  let steps: Vec<ProofStep> = match serde_json::from_value(proof_steps.unwrap().clone()) {
    Ok(s) => s,
    Err(_) => return false,
  };
  verify_proof(root.unwrap(), leaf.unwrap(), &steps)
}
