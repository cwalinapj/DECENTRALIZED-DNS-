use anyhow::Context;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;
use std::fs;
use std::path::Path;

pub struct NodeKeys {
  pub signing: SigningKey,
}

#[allow(dead_code)]
pub struct KeyMaterial {
  pub public_key_b64: String,
  pub private_key_b64: String,
}

pub fn load_or_generate(data_dir: &str) -> anyhow::Result<(NodeKeys, KeyMaterial)> {
  let key_dir = Path::new(data_dir).join("keys");
  let pub_path = key_dir.join("public.key");
  let priv_path = key_dir.join("private.key");
  if pub_path.exists() && priv_path.exists() {
    let pub_b64 = fs::read_to_string(&pub_path)?;
    let priv_b64 = fs::read_to_string(&priv_path)?;
    let _pub_bytes = STANDARD.decode(pub_b64.trim())?;
    let priv_bytes = STANDARD.decode(priv_b64.trim())?;
    let signing = SigningKey::from_bytes(priv_bytes.as_slice().try_into().context("invalid private key")?);
    return Ok((NodeKeys { signing }, KeyMaterial { public_key_b64: pub_b64.trim().to_string(), private_key_b64: priv_b64.trim().to_string() }));
  }

  fs::create_dir_all(&key_dir)?;
  let signing = SigningKey::generate(&mut OsRng);
  let public_key_b64 = STANDARD.encode(signing.verifying_key().to_bytes());
  let private_key_b64 = STANDARD.encode(signing.to_bytes());
  fs::write(&pub_path, &public_key_b64)?;
  fs::write(&priv_path, &private_key_b64)?;
  Ok((NodeKeys { signing }, KeyMaterial { public_key_b64, private_key_b64 }))
}
