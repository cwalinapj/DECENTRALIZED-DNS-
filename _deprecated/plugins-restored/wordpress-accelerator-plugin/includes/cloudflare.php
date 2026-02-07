<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_cf_api_request(string $method, string $url, string $token, array $payload = array()): array
{
    $headers = array(
        'Authorization' => 'Bearer ' . $token,
        'Content-Type' => 'application/json',
    );

    $args = array(
        'method' => $method,
        'headers' => $headers,
        'timeout' => 20,
    );

    if (!empty($payload)) {
        $args['body'] = wp_json_encode($payload);
    }

    $response = ddns_accelerator_api_request($url, $args);
    $data = json_decode($response['body'], true);

    if (!is_array($data)) {
        throw new RuntimeException('Unexpected Cloudflare response.');
    }

    if (empty($data['success'])) {
        $message = 'Cloudflare API error.';
        if (!empty($data['errors'][0]['message'])) {
            $message = $data['errors'][0]['message'];
        }
        throw new RuntimeException($message);
    }

    return $data;
}

function ddns_accelerator_cf_list_zones(string $token): array
{
    $url = 'https://api.cloudflare.com/client/v4/zones?per_page=50';
    $data = ddns_accelerator_cf_api_request('GET', $url, $token);

    $zones = array();
    foreach ($data['result'] as $zone) {
        if (!empty($zone['id']) && !empty($zone['name'])) {
            $zones[] = array(
                'id' => $zone['id'],
                'name' => $zone['name'],
            );
        }
    }

    return $zones;
}

function ddns_accelerator_cf_purge_urls(string $token, string $zone_id, array $urls): void
{
    if (empty($urls)) {
        return;
    }

    $url = 'https://api.cloudflare.com/client/v4/zones/' . rawurlencode($zone_id) . '/purge_cache';
    ddns_accelerator_cf_api_request('POST', $url, $token, array(
        'files' => array_values($urls),
    ));
}
