use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct CachedItem {
  pub body: String,
  pub expires_at: Instant,
  pub bytes: usize,
  pub result_hash: String,
}

pub struct Cache {
  max_items: usize,
  max_bytes: usize,
  current_bytes: usize,
  entries: HashMap<String, CachedItem>,
  order: VecDeque<String>,
}

impl Cache {
  pub fn new(max_items: usize, max_bytes: usize) -> Self {
    Self {
      max_items,
      max_bytes,
      current_bytes: 0,
      entries: HashMap::new(),
      order: VecDeque::new(),
    }
  }

  pub fn get(&mut self, key: &str) -> Option<CachedItem> {
    self.evict_expired();
    self.entries.get(key).cloned()
  }

  pub fn set(&mut self, key: String, body: String, ttl: Duration, result_hash: String) {
    let bytes = body.len();
    if bytes > self.max_bytes {
      return;
    }
    let expires_at = Instant::now() + ttl;
    if let Some(existing) = self.entries.insert(
      key.clone(),
      CachedItem {
        body,
        expires_at,
        bytes,
        result_hash,
      },
    ) {
      self.current_bytes = self.current_bytes.saturating_sub(existing.bytes);
    }
    self.order.push_back(key);
    self.current_bytes += bytes;
    self.trim();
  }

  fn trim(&mut self) {
    while self.entries.len() > self.max_items || self.current_bytes > self.max_bytes {
      if let Some(key) = self.order.pop_front() {
        if let Some(entry) = self.entries.remove(&key) {
          self.current_bytes = self.current_bytes.saturating_sub(entry.bytes);
        }
      } else {
        break;
      }
    }
  }

  fn evict_expired(&mut self) {
    let now = Instant::now();
    let keys: Vec<String> = self
      .entries
      .iter()
      .filter_map(|(k, v)| if v.expires_at <= now { Some(k.clone()) } else { None })
      .collect();
    for key in keys {
      if let Some(entry) = self.entries.remove(&key) {
        self.current_bytes = self.current_bytes.saturating_sub(entry.bytes);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn cache_ttl_expires() {
    let mut cache = Cache::new(10, 1024);
    cache.set("a".to_string(), "one".to_string(), Duration::from_millis(10), "hash".to_string());
    assert!(cache.get("a").is_some());
    std::thread::sleep(Duration::from_millis(20));
    assert!(cache.get("a").is_none());
  }
}
