<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_api_request(string $url, array $args = array()): array
{
    $defaults = array(
        'timeout' => 20,
    );
    $response = wp_remote_request($url, array_merge($defaults, $args));

    if (is_wp_error($response)) {
        throw new RuntimeException($response->get_error_message());
    }

    $status = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);

    return array(
        'status' => $status,
        'body' => $body,
        'headers' => wp_remote_retrieve_headers($response),
    );
}

function ddns_accelerator_api_json(string $url, array $payload, array $headers = array()): array
{
    $response = ddns_accelerator_api_request($url, array(
        'method' => 'POST',
        'headers' => array_merge(
            array(
                'Content-Type' => 'application/json',
            ),
            $headers
        ),
        'body' => wp_json_encode($payload),
    ));

    $data = json_decode($response['body'], true);
    if (!is_array($data)) {
        throw new RuntimeException('Unexpected API response.');
    }

    $data['_status'] = $response['status'];

    return $data;
}
