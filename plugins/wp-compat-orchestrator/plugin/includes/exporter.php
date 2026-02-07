<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_compat_export_bundle(): array
{
    require_once ABSPATH . 'wp-admin/includes/plugin.php';

    $plugins = get_plugins();
    $active = (array) get_option('active_plugins', array());
    $plugin_list = array();

    foreach ($plugins as $path => $data) {
        $plugin_list[] = array(
            'path' => $path,
            'name' => $data['Name'] ?? $path,
            'version' => $data['Version'] ?? '',
            'active' => in_array($path, $active, true),
        );
    }

    $theme = wp_get_theme();

    return array(
        'site' => array(
            'url' => home_url(),
            'name' => get_bloginfo('name'),
            'wp_version' => get_bloginfo('version'),
            'php_version' => PHP_VERSION,
            'timezone' => wp_timezone_string(),
        ),
        'theme' => array(
            'name' => $theme->get('Name'),
            'version' => $theme->get('Version'),
            'stylesheet' => $theme->get_stylesheet(),
        ),
        'plugins' => $plugin_list,
        'generated_at' => gmdate('c'),
    );
}
