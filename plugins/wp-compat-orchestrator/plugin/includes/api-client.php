<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_compat_control_plane_url(): string
{
    $url = (string) get_option('ddns_compat_control_plane_url', '');
    return rtrim($url, '/');
}

function ddns_compat_request(string $method, string $path, array $body = null): array
{
    $base = ddns_compat_control_plane_url();
    if ($base === '') {
        return array(
            'ok' => false,
            'error' => 'Control plane URL not set.',
        );
    }

    $url = $base . $path;
    $args = array(
        'method' => $method,
        'timeout' => 20,
        'headers' => array(
            'Content-Type' => 'application/json',
        ),
    );

    $api_key = (string) get_option('ddns_compat_api_key', '');
    if ($api_key !== '') {
        $args['headers']['x-ddns-compat-key'] = $api_key;
    }

    if ($body !== null) {
        $args['body'] = wp_json_encode($body);
    }

    $response = wp_remote_request($url, $args);
    if (is_wp_error($response)) {
        return array(
            'ok' => false,
            'error' => $response->get_error_message(),
        );
    }

    $status = wp_remote_retrieve_response_code($response);
    $raw = wp_remote_retrieve_body($response);
    $data = json_decode($raw, true);

    if ($status < 200 || $status >= 300) {
        return array(
            'ok' => false,
            'status' => $status,
            'error' => $data['error'] ?? $raw,
            'data' => $data,
        );
    }

    return array(
        'ok' => true,
        'status' => $status,
        'data' => is_array($data) ? $data : array('raw' => $raw),
    );
}
