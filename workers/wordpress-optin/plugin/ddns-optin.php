<?php
/**
 * Plugin Name: DDNS Opt-in
 * Description: Adds a simple opt-in form for decentralized DNS updates.
 * Version: 0.1.0
 * Author: DECENTRALIZED-DNS
 * Text Domain: ddns-optin
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DDNS_OPTIN_VERSION', '0.1.0');
define('DDNS_OPTIN_PATH', plugin_dir_path(__FILE__));
define('DDNS_OPTIN_URL', plugin_dir_url(__FILE__));

require_once DDNS_OPTIN_PATH . 'includes/admin-settings.php';

function ddns_optin_enqueue_assets(): void
{
    wp_enqueue_style(
        'ddns-optin',
        DDNS_OPTIN_URL . 'assets/optin.css',
        array(),
        DDNS_OPTIN_VERSION
    );
    wp_enqueue_script(
        'ddns-optin',
        DDNS_OPTIN_URL . 'assets/optin.js',
        array(),
        DDNS_OPTIN_VERSION,
        true
    );

    $categories_raw = get_option('ddns_optin_categories', '');
    $categories = array_filter(array_map('trim', preg_split('/[\r\n,]/', (string) $categories_raw)));
    $config = array(
        'endpoint' => get_option('ddns_optin_endpoint', ''),
        'site_id' => get_option('ddns_optin_site_id', ''),
        'categories' => array_values($categories),
    );

    wp_add_inline_script(
        'ddns-optin',
        'window.DDNS_OPTIN_CFG = ' . wp_json_encode($config) . ';',
        'before'
    );
}
add_action('wp_enqueue_scripts', 'ddns_optin_enqueue_assets');

function ddns_optin_shortcode(): string
{
    $heading = get_option('ddns_optin_heading', 'Stay updated on decentralized DNS.');
    $placeholder = get_option('ddns_optin_placeholder', 'you@example.com');
    $button = get_option('ddns_optin_button', 'Notify me');

    $heading = esc_html($heading);
    $placeholder = esc_attr($placeholder);
    $button = esc_html($button);

    return '<form class="ddns-optin-form" data-ddns-optin="1">'
        . '<label class="ddns-optin-label">' . $heading . '</label>'
        . '<div class="ddns-optin-fields">'
        . '<input type="email" name="ddns_optin_email" class="ddns-optin-input" '
        . 'placeholder="' . $placeholder . '" required>'
        . '<button type="submit" class="ddns-optin-button">' . $button . '</button>'
        . '</div>'
        . '<span class="ddns-optin-message" aria-live="polite"></span>'
        . '</form>';
}
add_shortcode('ddns_optin', 'ddns_optin_shortcode');
