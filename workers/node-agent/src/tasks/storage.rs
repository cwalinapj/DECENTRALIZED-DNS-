use crate::receipts::{Receipt, ReceiptEnvelope, sign_receipt};
use ed25519_dalek::SigningKey;
use std::sync::Arc;

pub async fn respond_to_audit_stub(signing_key: Arc<SigningKey>, node_id: &str) -> Option<ReceiptEnvelope> {
  let receipt = Receipt {
    receipt_type: "VERIFY".to_string(),
    node_id: node_id.to_string(),
    ts: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
    request: None,
    result_hash: None,
    bytes: None,
    details: None,
  };
  sign_receipt(&signing_key, receipt).ok()
}
