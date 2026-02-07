<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_optin_register_settings(): void
{
    // ----- Form copy settings -----
    register_setting(
        'ddns_optin',
        'ddns_optin_heading',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => 'Stay updated on decentralized DNS.',
        )
    );

    register_setting(
        'ddns_optin',
        'ddns_optin_placeholder',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => 'you@example.com',
        )
    );

    register_setting(
        'ddns_optin',
        'ddns_optin_button',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => 'Notify me',
        )
    );

    // ----- Worker destination (admin controlled) -----
    register_setting(
        'ddns_optin',
        'ddns_optin_worker_endpoint',
        array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        )
    );

    register_setting(
        'ddns_optin',
        'ddns_optin_site_id',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    // Optional: categories shown as checkboxes on the public form
    // Stored as an array; sanitize via custom callback
    register_setting(
        'ddns_optin',
        'ddns_optin_categories',
        array(
            'type' => 'array',
            'sanitize_callback' => 'ddns_optin_sanitize_categories',
            'default' => array('SITE_AVAILABILITY'),
        )
    );

    // ----- Settings UI -----
    add_settings_section(
        'ddns_optin_main',
        'Opt-in Form',
        '__return_false',
        'ddns-optin'
    );

    add_settings_field(
        'ddns_optin_heading',
        'Heading',
        'ddns_optin_render_heading_field',
        'ddns-optin',
        'ddns_optin_main'
    );

    add_settings_field(
        'ddns_optin_placeholder',
        'Email Placeholder',
        'ddns_optin_render_placeholder_field',
        'ddns-optin',
        'ddns_optin_main'
    );

    add_settings_field(
        'ddns_optin_button',
        'Button Label',
        'ddns_optin_render_button_field',
        'ddns-optin',
        'ddns_optin_main'
    );

    add_settings_section(
        'ddns_optin_worker',
        'Worker Destination',
        '__return_false',
        'ddns-optin'
    );

    add_settings_field(
        'ddns_optin_worker_endpoint',
        'Worker Endpoint URL',
        'ddns_optin_render_worker_endpoint_field',
        'ddns-optin',
        'ddns_optin_worker'
    );

    add_settings_field(
        'ddns_optin_site_id',
        'Site ID',
        'ddns_optin_render_site_id_field',
        'ddns-optin',
        'ddns_optin_worker'
    );

    add_settings_section(
        'ddns_optin_policy',
        'Policy (Optional)',
        '__return_false',
        'ddns-optin'
    );

    add_settings_field(
        'ddns_optin_categories',
        'Categories shown',
        'ddns_optin_render_categories_field',
        'ddns-optin',
        'ddns_optin_policy'
    );
}
add_action('admin_init', 'ddns_optin_register_settings');

function ddns_optin_add_settings_page(): void
{
    add_options_page(
        'DDNS Opt-in',
        'DDNS Opt-in',
        'manage_options',
        'ddns-optin',
        'ddns_optin_render_settings_page'
    );
}
add_action('admin_menu', 'ddns_optin_add_settings_page');

// ----- Sanitizers -----

function ddns_optin_sanitize_categories($value)
{
    $allowed = array(
        'SITE_AVAILABILITY',
        'DNS_COMPAT',
        'ROUTING_HINTS',
        'SECURITY_HEADERS',
        'PERF_LIGHT'
    );

    if (!is_array($value)) {
        return array('SITE_AVAILABILITY');
    }

    $out = array();
    foreach ($value as $v) {
        $v = sanitize_text_field($v);
        if (in_array($v, $allowed, true)) {
            $out[] = $v;
        }
    }

    if (empty($out)) {
        $out[] = 'SITE_AVAILABILITY';
    }

    // Deduplicate
    return array_values(array_unique($out));
}

// ----- Field renderers -----

function ddns_optin_render_heading_field(): void
{
    $value = esc_attr(get_option('ddns_optin_heading', 'Stay updated on decentralized DNS.'));
    echo '<input class="regular-text" type="text" name="ddns_optin_heading" value="' . $value . '">';
}

function ddns_optin_render_placeholder_field(): void
{
    $value = esc_attr(get_option('ddns_optin_placeholder', 'you@example.com'));
    echo '<input class="regular-text" type="text" name="ddns_optin_placeholder" value="' . $value . '">';
}

function ddns_optin_render_button_field(): void
{
    $value = esc_attr(get_option('ddns_optin_button', 'Notify me'));
    echo '<input class="regular-text" type="text" name="ddns_optin_button" value="' . $value . '">';
}

function ddns_optin_render_worker_endpoint_field(): void
{
    $value = esc_attr(get_option('ddns_optin_worker_endpoint', ''));
    echo '<input class="regular-text" type="url" name="ddns_optin_worker_endpoint" value="' . $value . '" placeholder="https://worker.yourdomain.tld/v1/optin/submit">';
    echo '<p class="description">The public DDNS server endpoint that receives opt-in submissions. WordPress exposes no public API endpoints.</p>';
}

function ddns_optin_render_site_id_field(): void
{
    $value = esc_attr(get_option('ddns_optin_site_id', ''));
    echo '<input class="regular-text" type="text" name="ddns_optin_site_id" value="' . $value . '" placeholder="site_123">';
    echo '<p class="description">Identifier assigned on your DDNS server. Used to map submissions to the correct site.</p>';
}

function ddns_optin_render_categories_field(): void
{
    $all = array(
        'SITE_AVAILABILITY' => 'SITE_AVAILABILITY (uptime/latency)',
        'DNS_COMPAT' => 'DNS_COMPAT (public DNS record compatibility)',
        'ROUTING_HINTS' => 'ROUTING_HINTS (subdomain routing hints)',
        'SECURITY_HEADERS' => 'SECURITY_HEADERS (public response headers)',
        'PERF_LIGHT' => 'PERF_LIGHT (TTFB/caching headers)'
    );

    $selected = get_option('ddns_optin_categories', array('SITE_AVAILABILITY'));
    if (!is_array($selected)) $selected = array('SITE_AVAILABILITY');

    foreach ($all as $k => $label) {
        $checked = in_array($k, $selected, true) ? 'checked' : '';
        echo '<label style="display:block; margin:4px 0;">';
        echo '<input type="checkbox" name="ddns_optin_categories[]" value="' . esc_attr($k) . '" ' . $checked . '> ';
        echo esc_html($label);
        echo '</label>';
    }
    echo '<p class="description">These categories appear on the public opt-in form. Users can uncheck them before submitting.</p>';
}

function ddns_optin_render_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>DDNS Opt-in</h1>
        <form method="post" action="options.php">
            <?php settings_fields('ddns_optin'); ?>
            <?php do_settings_sections('ddns-optin'); ?>
            <?php submit_button(); ?>
        </form>

        <hr />
        <h2>Shortcode</h2>
        <p>Place this in any page/post:</p>
        <code>[ddns_optin]</code>
    </div>
    <?php
}
