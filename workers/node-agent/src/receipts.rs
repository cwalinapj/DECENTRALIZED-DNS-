use base64::{engine::general_purpose::STANDARD, Engine as _};
use blake3::Hasher;
use ed25519_dalek::{Signature, SigningKey, VerifyingKey, Signer, Verifier};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReceiptRequest {
  pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Receipt {
  #[serde(rename = "type")]
  pub receipt_type: String,
  pub node_id: String,
  pub ts: u64,
  pub request: Option<ReceiptRequest>,
  pub result_hash: Option<String>,
  pub bytes: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub details: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReceiptEnvelope {
  pub receipt: Receipt,
  pub signature: String,
  pub public_key: String,
}

pub fn canonical_json(value: &Value) -> Value {
  match value {
    Value::Object(map) => {
      let mut sorted = BTreeMap::new();
      for (k, v) in map {
        sorted.insert(k.clone(), canonical_json(v));
      }
      let mut new_map = serde_json::Map::new();
      for (k, v) in sorted {
        new_map.insert(k, v);
      }
      Value::Object(new_map)
    }
    Value::Array(arr) => Value::Array(arr.iter().map(canonical_json).collect()),
    _ => value.clone(),
  }
}

pub fn receipt_message(receipt: &Receipt) -> anyhow::Result<String> {
  let value = serde_json::to_value(receipt)?;
  let canonical = canonical_json(&value);
  Ok(format!("receipt\n{}", serde_json::to_string(&canonical)?))
}

#[allow(dead_code)]
pub fn hash_receipt(receipt: &Receipt) -> anyhow::Result<String> {
  let msg = receipt_message(receipt)?;
  let mut hasher = Hasher::new();
  hasher.update(msg.as_bytes());
  Ok(STANDARD.encode(hasher.finalize().as_bytes()))
}

pub fn sign_receipt(signing_key: &SigningKey, receipt: Receipt) -> anyhow::Result<ReceiptEnvelope> {
  let msg = receipt_message(&receipt)?;
  let sig: Signature = signing_key.sign(msg.as_bytes());
  let signature = STANDARD.encode(sig.to_bytes());
  let public_key = STANDARD.encode(signing_key.verifying_key().to_bytes());
  Ok(ReceiptEnvelope { receipt, signature, public_key })
}

pub fn verify_envelope(envelope: &ReceiptEnvelope) -> anyhow::Result<bool> {
  if envelope.receipt.node_id != envelope.public_key {
    return Ok(false);
  }
  let msg = receipt_message(&envelope.receipt)?;
  let sig_bytes = STANDARD.decode(&envelope.signature)?;
  let sig = Signature::from_slice(sig_bytes.as_slice())?;
  let pub_bytes = STANDARD.decode(&envelope.public_key)?;
  let pub_key = VerifyingKey::from_bytes(pub_bytes.as_slice().try_into()?)?;
  Ok(pub_key.verify(msg.as_bytes(), &sig).is_ok())
}

pub fn hash_response(body: &str) -> String {
  let mut hasher = Hasher::new();
  hasher.update(body.as_bytes());
  STANDARD.encode(hasher.finalize().as_bytes())
}

#[cfg(test)]
mod tests {
  use super::*;
  use ed25519_dalek::SigningKey;
  use rand::rngs::OsRng;

  #[test]
  fn sign_and_verify_envelope() {
    let signing = SigningKey::generate(&mut OsRng);
    let receipt = Receipt {
      receipt_type: "SERVE".to_string(),
      node_id: STANDARD.encode(signing.verifying_key().to_bytes()),
      ts: 1,
      request: Some(ReceiptRequest { name: "example.com".to_string() }),
      result_hash: Some("abc".to_string()),
      bytes: Some(10),
      details: None,
    };
    let env = sign_receipt(&signing, receipt).unwrap();
    assert!(verify_envelope(&env).unwrap());
  }
}
