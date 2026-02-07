<?php
/**
 * Plugin Name: DDNS Accelerator
 * Description: Adds an admin wizard to install caching workers and sync WordPress assets to GitHub.
 * Version: 0.1.0
 * Author: DECENTRALIZED-DNS
 * Text Domain: ddns-accelerator
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DDNS_ACCELERATOR_VERSION', '0.1.0');
define('DDNS_ACCELERATOR_PATH', plugin_dir_path(__FILE__));
define('DDNS_ACCELERATOR_URL', plugin_dir_url(__FILE__));

require_once DDNS_ACCELERATOR_PATH . 'includes/api-client.php';
require_once DDNS_ACCELERATOR_PATH . 'includes/cloudflare.php';
require_once DDNS_ACCELERATOR_PATH . 'includes/github.php';
require_once DDNS_ACCELERATOR_PATH . 'includes/snapshot.php';
require_once DDNS_ACCELERATOR_PATH . 'includes/settings.php';
require_once DDNS_ACCELERATOR_PATH . 'includes/wizard.php';
require_once DDNS_ACCELERATOR_PATH . 'includes/jobs.php';

function ddns_accelerator_enqueue_admin_assets(string $hook): void
{
    if ($hook !== 'toplevel_page_ddns-accelerator') {
        return;
    }

    wp_enqueue_style(
        'ddns-accelerator-admin',
        DDNS_ACCELERATOR_URL . 'assets/admin.css',
        array(),
        DDNS_ACCELERATOR_VERSION
    );
    wp_enqueue_script(
        'ddns-accelerator-admin',
        DDNS_ACCELERATOR_URL . 'assets/admin.js',
        array(),
        DDNS_ACCELERATOR_VERSION,
        true
    );

    $config = array(
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('ddns-accelerator'),
        'selectedZoneId' => get_option('ddns_accelerator_cf_zone_id', ''),
        'selectedZoneName' => get_option('ddns_accelerator_cf_zone_name', ''),
    );

    wp_add_inline_script(
        'ddns-accelerator-admin',
        'window.DDNS_ACCELERATOR_CFG = ' . wp_json_encode($config) . ';',
        'before'
    );
}
add_action('admin_enqueue_scripts', 'ddns_accelerator_enqueue_admin_assets');
