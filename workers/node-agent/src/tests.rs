#[cfg(test)]
mod tests {
  use crate::receipts::{Receipt, ReceiptRequest, sign_receipt, verify_envelope};
  use base64::{engine::general_purpose::STANDARD, Engine as _};
  use ed25519_dalek::SigningKey;
  use rand::rngs::OsRng;

  #[test]
  fn receipt_sign_verify() {
    let signing = SigningKey::generate(&mut OsRng);
    let receipt = Receipt {
      receipt_type: "SERVE".to_string(),
      node_id: STANDARD.encode(signing.verifying_key().to_bytes()),
      ts: 1,
      request: Some(ReceiptRequest { name: "example.com".to_string() }),
      result_hash: Some("hash".to_string()),
      bytes: Some(10),
      details: None,
    };
    let env = sign_receipt(&signing, receipt).unwrap();
    assert!(verify_envelope(&env).unwrap());
  }
}
