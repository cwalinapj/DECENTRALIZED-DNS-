use axum::{extract::{Query, State}, http::StatusCode, response::IntoResponse, routing::{get, post}, Json, Router};
use governor::{Quota, RateLimiter};
use std::{num::NonZeroU32, sync::Arc, time::{SystemTime, UNIX_EPOCH}};
use tokio::sync::Mutex;
use tracing::warn;

use crate::{cache::Cache, coordinator::CoordinatorClient, receipts::{Receipt, ReceiptRequest, sign_receipt}, tasks::storage::respond_to_audit_stub};
use ed25519_dalek::SigningKey;

#[derive(Clone)]
pub struct AppState {
  pub cache: Arc<Mutex<Cache>>,
  pub coordinator: Arc<CoordinatorClient>,
  pub signing_key: Arc<SigningKey>,
  pub node_id: String,
  pub limiter: Arc<RateLimiter<governor::state::direct::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock>>,
}

#[derive(serde::Deserialize)]
struct ResolveParams {
  name: String,
}

pub fn build_router(state: AppState) -> Router {
  Router::new()
    .route("/healthz", get(healthz))
    .route("/resolve", get(resolve))
    .route("/audit", post(audit_stub))
    .with_state(state)
}

async fn healthz() -> impl IntoResponse {
  Json(serde_json::json!({"status": "ok"}))
}

async fn audit_stub(State(state): State<AppState>) -> impl IntoResponse {
  if state.limiter.check().is_err() {
    return (StatusCode::TOO_MANY_REQUESTS, Json(serde_json::json!({"error": "rate_limited"}))).into_response();
  }
  let envelope = respond_to_audit_stub(state.signing_key.clone(), &state.node_id).await;
  match envelope {
    Some(env) => (StatusCode::OK, Json(env)).into_response(),
    None => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "audit_failed"}))).into_response(),
  }
}

async fn resolve(State(state): State<AppState>, Query(params): Query<ResolveParams>) -> impl IntoResponse {
  if state.limiter.check().is_err() {
    return (StatusCode::TOO_MANY_REQUESTS, Json(serde_json::json!({"error": "rate_limited"}))).into_response();
  }
  let mut cache = state.cache.lock().await;
  if let Some(item) = cache.get(&params.name) {
    let receipt = Receipt {
      receipt_type: "SERVE".to_string(),
      node_id: state.node_id.clone(),
      ts: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
      request: Some(ReceiptRequest { name: params.name.clone() }),
      result_hash: Some(item.result_hash.clone()),
      bytes: Some(item.bytes as u64),
      details: None,
    };
    let envelope = match sign_receipt(&state.signing_key, receipt) {
      Ok(env) => env,
      Err(err) => {
        warn!("failed to sign receipt: {}", err);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "receipt_failed"}))).into_response();
      }
    };
    let coordinator = state.coordinator.clone();
    tokio::spawn(async move {
      let _ = coordinator.post_receipt(&envelope).await;
    });
    return (StatusCode::OK, [ ("content-type", "application/json") ], item.body).into_response();
  }
  (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "not_cached"}))).into_response()
}

pub fn rate_limiter(rps: u32) -> RateLimiter<governor::state::direct::NotKeyed, governor::state::InMemoryState, governor::clock::DefaultClock> {
  let rps = NonZeroU32::new(rps.max(1)).unwrap();
  RateLimiter::direct(Quota::per_second(rps))
}
