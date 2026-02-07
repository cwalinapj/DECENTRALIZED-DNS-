<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_snapshot_targets(): array
{
    return array(
        'uploads' => array(
            'label' => 'Uploads (wp-content/uploads)',
            'path' => wp_get_upload_dir()['basedir'],
        ),
        'themes' => array(
            'label' => 'Themes (wp-content/themes)',
            'path' => get_theme_root(),
        ),
        'plugins' => array(
            'label' => 'Plugins (wp-content/plugins)',
            'path' => WP_PLUGIN_DIR,
        ),
    );
}

function ddns_accelerator_collect_files(array $paths): array
{
    $files = array();

    foreach ($paths as $path) {
        if (empty($path) || !is_dir($path)) {
            continue;
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $full = $file->getPathname();
            if (!is_readable($full)) {
                continue;
            }
            $files[] = $full;
        }
    }

    return $files;
}

function ddns_accelerator_relative_path(string $path): string
{
    $root = wp_normalize_path(ABSPATH);
    $path = wp_normalize_path($path);

    if (strpos($path, $root) === 0) {
        $path = substr($path, strlen($root));
    }

    return ltrim($path, '/');
}

function ddns_accelerator_build_manifest(array $files): array
{
    $manifest = array();
    foreach ($files as $file) {
        $relative = ddns_accelerator_relative_path($file);
        $hash = sha1_file($file);
        if ($hash) {
            $manifest[$relative] = $hash;
        }
    }
    return $manifest;
}

function ddns_accelerator_run_snapshot(bool $force = false): array
{
    $owner = trim((string) get_option('ddns_accelerator_github_owner', ''));
    $repo = trim((string) get_option('ddns_accelerator_github_repo', ''));
    $pat = trim((string) get_option('ddns_accelerator_github_pat', ''));
    $token = trim((string) get_option('ddns_accelerator_cf_api_token', ''));
    $zone_id = trim((string) get_option('ddns_accelerator_cf_zone_id', ''));

    if ($owner === '' || $repo === '' || $pat === '') {
        throw new RuntimeException('GitHub settings are required before syncing.');
    }

    $selected = get_option('ddns_accelerator_snapshot_dirs', array());
    if (!is_array($selected)) {
        $selected = array();
    }

    $targets = ddns_accelerator_snapshot_targets();
    $paths = array();
    foreach ($selected as $key) {
        if (!empty($targets[$key]['path'])) {
            $paths[] = $targets[$key]['path'];
        }
    }

    if (empty($paths)) {
        throw new RuntimeException('Select at least one directory to sync.');
    }

    $files = ddns_accelerator_collect_files($paths);
    $manifest = ddns_accelerator_build_manifest($files);
    $previous = get_option('ddns_accelerator_snapshot_manifest', array());
    if (!is_array($previous)) {
        $previous = array();
    }

    $changed = array();
    foreach ($manifest as $path => $hash) {
        if ($force || !isset($previous[$path]) || $previous[$path] !== $hash) {
            $changed[] = $path;
        }
    }

    $uploaded = 0;
    $urls = array();
    foreach ($changed as $relative) {
        $absolute = wp_normalize_path(ABSPATH . $relative);
        if (!is_readable($absolute)) {
            continue;
        }
        $content = file_get_contents($absolute);
        if ($content === false) {
            continue;
        }

        $repo_path = 'site/' . $relative;
        $message = 'Sync ' . $relative;
        ddns_accelerator_github_upsert_file($owner, $repo, $repo_path, $content, $pat, $message);
        $uploaded++;

        if (strpos($relative, 'wp-content/') === 0) {
            $urls[] = trailingslashit(site_url()) . $relative;
        }
    }

    update_option('ddns_accelerator_snapshot_manifest', $manifest, false);
    update_option('ddns_accelerator_last_snapshot', current_time('mysql'), false);
    delete_option('ddns_accelerator_last_snapshot_error');

    if (!empty($urls) && $token !== '' && $zone_id !== '') {
        ddns_accelerator_cf_purge_urls($token, $zone_id, $urls);
    }

    return array(
        'total' => count($files),
        'changed' => count($changed),
        'uploaded' => $uploaded,
    );
}
