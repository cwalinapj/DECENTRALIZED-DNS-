<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_optin_register_settings(): void
{
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

    register_setting(
        'ddns_optin',
        'ddns_optin_endpoint',
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

    register_setting(
        'ddns_optin',
        'ddns_optin_categories',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_textarea_field',
            'default' => '',
        )
    );

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

    add_settings_field(
        'ddns_optin_endpoint',
        'Worker Endpoint URL',
        'ddns_optin_render_endpoint_field',
        'ddns-optin',
        'ddns_optin_main'
    );

    add_settings_field(
        'ddns_optin_site_id',
        'Site ID',
        'ddns_optin_render_site_id_field',
        'ddns-optin',
        'ddns_optin_main'
    );

    add_settings_field(
        'ddns_optin_categories',
        'Allowed Categories',
        'ddns_optin_render_categories_field',
        'ddns-optin',
        'ddns_optin_main'
    );
}
add_action('admin_init', 'ddns_optin_register_settings');

function ddns_optin_add_settings_page(): void
{
    add_options_page('DDNS Opt-in', 'DDNS Opt-in', 'manage_options', 'ddns-optin', 'ddns_optin_render_settings_page');
}
add_action('admin_menu', 'ddns_optin_add_settings_page');

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

function ddns_optin_render_endpoint_field(): void
{
    $value = get_option('ddns_optin_endpoint', '');
    printf(
        '<input class="regular-text" type="url" name="ddns_optin_endpoint" value="%s" placeholder="%s">',
        esc_attr($value),
        esc_attr('https://example.com/v1/optin/submit')
    );
}

function ddns_optin_render_site_id_field(): void
{
    $value = get_option('ddns_optin_site_id', '');
    printf(
        '<input class="regular-text" type="text" name="ddns_optin_site_id" value="%s">',
        esc_attr($value)
    );
}

function ddns_optin_render_categories_field(): void
{
    $value = esc_textarea(get_option('ddns_optin_categories', ''));
    echo '<textarea class="large-text" rows="4" name="ddns_optin_categories">' . $value . '</textarea>';
    echo '<p class="description">Comma or newline separated categories shown as checkboxes.</p>';
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
    </div>
    <?php
}
