use hex::encode;
use serde::Deserialize;
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Deserialize)]
pub struct ProofStep {
  pub hash: String,
  pub position: String,
}

pub fn verify_proof(root: &str, leaf: &str, proof: &[ProofStep]) -> bool {
  let mut computed = leaf.to_string();
  for step in proof {
    let combined = if step.position == "left" {
      format!("{}{}", step.hash, computed)
    } else {
      format!("{}{}", computed, step.hash)
    };
    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    computed = encode(hasher.finalize());
  }
  computed == root
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn verify_proof_empty_matches_root() {
    let root = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    assert!(verify_proof(root, root, &[]));
  }
}
