<?php
if (!defined('ABSPATH')) exit;

function ddns_compat_build_manifest() {
  global $wp_version;
  $theme = wp_get_theme();
  $plugins = get_plugins();
  $active = get_option('active_plugins', array());

  $active_plugins = array();
  foreach ($active as $p) {
    $active_plugins[] = array(
      'slug' => $p,
      'name' => $plugins[$p]['Name'] ?? $p,
      'version' => $plugins[$p]['Version'] ?? '',
    );
  }

  return array(
    'site_url' => home_url(),
    'wp_version' => $wp_version,
    'php_version' => PHP_VERSION,
    'theme' => array(
      'name' => $theme->get('Name'),
      'stylesheet' => $theme->get_stylesheet(),
      'version' => $theme->get('Version'),
    ),
    'active_plugins' => $active_plugins,
    'generated_at' => time(),
  );
}

function ddns_compat_export_bundle() {
  $tmp = wp_upload_dir();
  $base = trailingslashit($tmp['basedir']) . 'ddns-compat';
  if (!file_exists($base)) wp_mkdir_p($base);

  $zip_path = $base . '/bundle-' . time() . '.zip';

  $zip = new ZipArchive();
  if ($zip->open($zip_path, ZipArchive::CREATE) !== true) return false;

  // manifest.json
  $manifest = ddns_compat_build_manifest();
  $zip->addFromString('manifest.json', wp_json_encode($manifest, JSON_PRETTY_PRINT));

  // Include wp-content (MVP: themes + plugins + uploads)
  $content_dir = WP_CONTENT_DIR;
  ddns_compat_zip_add_dir($zip, $content_dir . '/themes', 'wp-content/themes');
  ddns_compat_zip_add_dir($zip, $content_dir . '/plugins', 'wp-content/plugins');
  ddns_compat_zip_add_dir($zip, $content_dir . '/uploads', 'wp-content/uploads');

  // Optional DB export (MVP: only if WP-CLI is available and allowed)
  // You can replace this with a safer exporter later.
  $db_sql = ddns_compat_try_db_export($base);
  if ($db_sql) {
    $zip->addFile($db_sql, 'db.sql');
  }

  $zip->close();
  return $zip_path;
}

function ddns_compat_zip_add_dir($zip, $dir, $prefix) {
  if (!is_dir($dir)) return;
  $iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
  );

  foreach ($iterator as $file) {
    $path = $file->getPathname();
    $rel = $prefix . substr($path, strlen($dir));
    if ($file->isDir()) {
      $zip->addEmptyDir($rel);
    } else {
      // Avoid gigantic bundles by skipping cache dirs if desired
      $zip->addFile($path, $rel);
    }
  }
}

function ddns_compat_try_db_export($base_dir) {
  // WARNING: WP-CLI is not always available on shared hosting.
  // MVP: attempt and ignore failure.
  $out = $base_dir . '/db-' . time() . '.sql';
  $cmd = 'wp db export ' . escapeshellarg($out) . ' --quiet';
  @exec($cmd, $o, $code);
  if ($code === 0 && file_exists($out)) return $out;
  return false;
}
