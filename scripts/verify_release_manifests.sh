#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST_DIR="artifacts/releases"

fail() {
  echo "release_manifest_verify: FAIL - $1" >&2
  exit 1
}

need_cmd() {
  local c="$1"
  command -v "$c" >/dev/null 2>&1 || fail "missing required command: $c"
}

need_cmd jq
need_cmd openssl
need_cmd shasum
need_cmd base64

[[ -d "$MANIFEST_DIR" ]] || fail "missing manifest directory: $MANIFEST_DIR"

mapfile -t manifests < <(find "$MANIFEST_DIR" -maxdepth 1 -type f -name '*.json' | sort)
[[ "${#manifests[@]}" -gt 0 ]] || fail "no manifests found in $MANIFEST_DIR"

verify_one() {
  local manifest="$1"
  local base env version payload payload_sha field_payload_sha pubkey_path sig_b64
  local payload_file sig_file

  base="$(basename "$manifest")"
  env="${base%.json}"

  jq -e . "$manifest" >/dev/null || fail "$base is not valid JSON"

  version="$(jq -r '.manifest_version // empty' "$manifest")"
  [[ "$version" == "1" ]] || fail "$base manifest_version must be \"1\""

  if [[ "$(jq -r '.environment // empty' "$manifest")" != "$env" ]]; then
    fail "$base environment does not match filename"
  fi

  if [[ "$(jq -r '.status // empty' "$manifest")" == "" ]]; then
    fail "$base missing status"
  fi

  while IFS= read -r row; do
    local path sha expected actual
    path="$(jq -r '.path // empty' <<<"$row")"
    sha="$(jq -r '.sha256 // empty' <<<"$row")"
    [[ -n "$path" ]] || fail "$base has artifact entry with empty path"
    [[ -n "$sha" ]] || fail "$base has artifact entry with empty sha256"
    [[ -f "$path" ]] || fail "$base artifact missing on disk: $path"
    actual="$(shasum -a 256 "$path" | awk '{print $1}')"
    expected="$sha"
    if [[ "$actual" != "$expected" ]]; then
      fail "$base checksum mismatch for $path"
    fi
  done < <(jq -c '.artifacts[]? // empty' "$manifest")

  payload="$(jq -cS 'del(.signature)' "$manifest")"
  payload_sha="$(printf "%s" "$payload" | shasum -a 256 | awk '{print $1}')"
  field_payload_sha="$(jq -r '.signature.payload_sha256 // empty' "$manifest")"
  [[ -n "$field_payload_sha" ]] || fail "$base missing signature.payload_sha256"
  [[ "$payload_sha" == "$field_payload_sha" ]] || fail "$base payload sha mismatch"

  if [[ "$(jq -r '.signature.algorithm // empty' "$manifest")" != "ed25519" ]]; then
    fail "$base signature.algorithm must be ed25519"
  fi
  pubkey_path="$(jq -r '.signature.public_key_pem_path // empty' "$manifest")"
  sig_b64="$(jq -r '.signature.signature_base64 // empty' "$manifest")"
  [[ -n "$pubkey_path" ]] || fail "$base missing signature.public_key_pem_path"
  [[ -n "$sig_b64" ]] || fail "$base missing signature.signature_base64"
  [[ -f "$pubkey_path" ]] || fail "$base public key path missing: $pubkey_path"

  payload_file="$(mktemp)"
  sig_file="$(mktemp)"
  trap 'rm -f "$payload_file" "$sig_file"' RETURN
  printf "%s" "$payload" >"$payload_file"
  printf "%s" "$sig_b64" | base64 --decode >"$sig_file"

  if ! openssl pkeyutl -verify -pubin -inkey "$pubkey_path" -rawin -in "$payload_file" -sigfile "$sig_file" >/dev/null 2>&1; then
    fail "$base signature verification failed"
  fi

  echo "release_manifest_verify: OK - $base"
}

echo "==> verifying signed release manifests"
for m in "${manifests[@]}"; do
  verify_one "$m"
done
echo "release_manifest_verify: PASS (${#manifests[@]} manifest(s))"
