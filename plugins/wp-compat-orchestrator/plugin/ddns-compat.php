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

define('DDNS_COMPAT_VERSION', '0.1.0');
define('DDNS_COMPAT_PATH', plugin_dir_path(__FILE__));
define('DDNS_COMPAT_URL', plugin_dir_url(__FILE__));

require_once DDNS_COMPAT_PATH . 'includes/api-client.php';
require_once DDNS_COMPAT_PATH . 'includes/exporter.php';
require_once DDNS_COMPAT_PATH . 'includes/admin-ui.php';
require_once DDNS_COMPAT_PATH . 'includes/wallet.php';
require_once DDNS_COMPAT_PATH . 'includes/miner-proof.php';
