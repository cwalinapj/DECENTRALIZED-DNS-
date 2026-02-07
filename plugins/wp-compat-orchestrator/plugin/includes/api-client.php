<?php
if (!defined('ABSPATH')) exit;

function ddns_compat_http_post_json($url, $headers, $body) {
  $args = array(
    'timeout' => 60,
    'headers' => array_merge(array('content-type' => 'application/json'), $headers),
    'body' => wp_json_encode($body),
  );
  $res = wp_remote_post($url, $args);
  if (is_wp_error($res)) return array('ok' => false, 'error' => $res->get_error_message());
  $code = wp_remote_retrieve_response_code($res);
  $txt = wp_remote_retrieve_body($res);
  $json = json_decode($txt, true);
  if ($code < 200 || $code >= 300) return array('ok' => false, 'error' => $json['error'] ?? $txt);
  return $json ?: array('ok' => true);
}

function ddns_compat_http_get_json($url, $headers) {
  $args = array('timeout' => 60, 'headers' => $headers);
  $res = wp_remote_get($url, $args);
  if (is_wp_error($res)) return array('ok' => false, 'error' => $res->get_error_message());
  $code = wp_remote_retrieve_response_code($res);
  $txt = wp_remote_retrieve_body($res);
  $json = json_decode($txt, true);
  if ($code < 200 || $code >= 300) return array('ok' => false, 'error' => $json['error'] ?? $txt);
  return $json ?: array('ok' => true);
}

function ddns_compat_api_register_site($cp, $site_id, $manifest) {
  return ddns_compat_http_post_json(rtrim($cp,'/') . '/v1/sites/register', array(), array(
    'site_id' => $site_id,
    'manifest' => $manifest
  ));
}

function ddns_compat_api_upload_bundle($cp, $site_id, $token, $bundle_path) {
  $url = rtrim($cp,'/') . '/v1/uploads/' . rawurlencode($site_id);

  $boundary = wp_generate_password(24, false, false);
  $headers = array(
    'content-type' => 'multipart/form-data; boundary=' . $boundary,
    'x-ddns-site-token' => $token
  );

  $file = file_get_contents($bundle_path);
  if ($file === false) return array('ok' => false, 'error' => 'read_bundle_failed');

  $body = '';
  $body .= "--$boundary\r\n";
  $body .= "Content-Disposition: form-data; name=\"bundle\"; filename=\"bundle.zip\"\r\n";
  $body .= "Content-Type: application/zip\r\n\r\n";
  $body .= $file . "\r\n";
  $body .= "--$boundary--\r\n";

  $res = wp_remote_post($url, array(
    'timeout' => 120,
    'headers' => $headers,
    'body' => $body
  ));

  if (is_wp_error($res)) return array('ok' => false, 'error' => $res->get_error_message());
  $code = wp_remote_retrieve_response_code($res);
  $txt = wp_remote_retrieve_body($res);
  $json = json_decode($txt, true);
  if ($code < 200 || $code >= 300) return array('ok' => false, 'error' => $json['error'] ?? $txt);
  return $json;
}

function ddns_compat_api_create_job($cp, $site_id, $token, $upload_id) {
  return ddns_compat_http_post_json(rtrim($cp,'/') . '/v1/jobs/create', array(
    'x-ddns-site-id' => $site_id,
    'x-ddns-site-token' => $token
  ), array(
    'upload_id' => $upload_id
  ));
}

function ddns_compat_api_get_job($cp, $site_id, $token, $job_id) {
  return ddns_compat_http_get_json(rtrim($cp,'/') . '/v1/jobs/' . rawurlencode($job_id), array(
    'x-ddns-site-id' => $site_id,
    'x-ddns-site-token' => $token
  ));
}
