<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_sanitize_bool($value): int
{
    return $value ? 1 : 0;
}

function ddns_accelerator_sanitize_dirs($value): array
{
    $allowed = array('uploads', 'themes', 'plugins');
    if (!is_array($value)) {
        return array();
    }
    $out = array();
    foreach ($value as $item) {
        $item = sanitize_text_field($item);
        if (in_array($item, $allowed, true)) {
            $out[] = $item;
        }
    }
    return array_values(array_unique($out));
}

function ddns_accelerator_register_settings(): void
{
    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_worker_endpoint',
        array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_github_owner',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_github_repo',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_github_pat',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_cf_api_token',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_cf_zone_id',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_cf_zone_name',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_snapshot_dirs',
        array(
            'type' => 'array',
            'sanitize_callback' => 'ddns_accelerator_sanitize_dirs',
            'default' => array('uploads'),
        )
    );

    register_setting(
        'ddns_accelerator',
        'ddns_accelerator_auto_sync',
        array(
            'type' => 'boolean',
            'sanitize_callback' => 'ddns_accelerator_sanitize_bool',
            'default' => 0,
        )
    );
}
add_action('admin_init', 'ddns_accelerator_register_settings');
