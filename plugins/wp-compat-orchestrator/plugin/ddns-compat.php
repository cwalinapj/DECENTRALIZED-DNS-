<?php
/**
 * Plugin Name: DDNS Compat Orchestrator
 * Description: Runs WordPress compatibility checks through the DDNS control plane.
 * Version: 0.1.0
 * Author: DECENTRALIZED-DNS
 * Text Domain: ddns-compat
 */

if (!defined('ABSPATH')) {
    exit;
}
if (!defined('ABSPATH')) exit;

define('DDNS_COMPAT_VERSION', '0.1.0');
define('DDNS_COMPAT_PATH', plugin_dir_path(__FILE__));
define('DDNS_COMPAT_URL', plugin_dir_url(__FILE__));

require_once DDNS_COMPAT_PATH . 'includes/api-client.php';
require_once DDNS_COMPAT_PATH . 'includes/exporter.php';
require_once DDNS_COMPAT_PATH . 'includes/admin-ui.php';
require_once DDNS_COMPAT_PATH . 'includes/wallet.php';
require_once DDNS_COMPAT_PATH . 'includes/miner-proof.php';
require_once DDNS_COMPAT_PATH . 'includes/jobs.php';
require_once DDNS_COMPAT_PATH . 'includes/admin-ui.php';
require_once DDNS_COMPAT_PATH . 'includes/wallet.php';
require_once DDNS_COMPAT_PATH . 'includes/miner-proof.php';

function ddns_compat_enqueue_admin_assets($hook): void {
  if ($hook !== 'settings_page_ddns-compat') return;

  wp_enqueue_style('ddns-compat-admin', DDNS_COMPAT_URL . 'assets/admin.css', array(), DDNS_COMPAT_VERSION);
  wp_enqueue_script('ddns-compat-admin', DDNS_COMPAT_URL . 'assets/admin.js', array(), DDNS_COMPAT_VERSION, true);

  wp_localize_script('ddns-compat-admin', 'DDNS_COMPAT_CFG', array(
    'ajaxUrl' => admin_url('admin-ajax.php'),
    'nonce'   => wp_create_nonce('ddns_compat_nonce'),
  ));
}
add_action('admin_enqueue_scripts', 'ddns_compat_enqueue_admin_assets');
