<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_github_request(string $method, string $url, string $pat, array $payload = array()): array
{
    $headers = array(
        'Authorization' => 'token ' . $pat,
        'User-Agent' => 'ddns-accelerator',
        'Accept' => 'application/vnd.github+json',
        'Content-Type' => 'application/json',
    );

    $args = array(
        'method' => $method,
        'headers' => $headers,
        'timeout' => 30,
    );

    if (!empty($payload)) {
        $args['body'] = wp_json_encode($payload);
    }

    $response = ddns_accelerator_api_request($url, $args);

    $data = json_decode($response['body'], true);
    if (!is_array($data)) {
        $data = array();
    }

    return array(
        'status' => $response['status'],
        'data' => $data,
    );
}

function ddns_accelerator_github_get_file_sha(string $owner, string $repo, string $path, string $pat): string
{
    $url = sprintf('https://api.github.com/repos/%s/%s/contents/%s', rawurlencode($owner), rawurlencode($repo), str_replace('%2F', '/', rawurlencode($path)));
    $response = ddns_accelerator_github_request('GET', $url, $pat);

    if ($response['status'] === 200 && !empty($response['data']['sha'])) {
        return (string) $response['data']['sha'];
    }

    return '';
}

function ddns_accelerator_github_upsert_file(
    string $owner,
    string $repo,
    string $path,
    string $content,
    string $pat,
    string $message
): void {
    $sha = ddns_accelerator_github_get_file_sha($owner, $repo, $path, $pat);

    $payload = array(
        'message' => $message,
        'content' => base64_encode($content),
    );

    if (!empty($sha)) {
        $payload['sha'] = $sha;
    }

    $url = sprintf('https://api.github.com/repos/%s/%s/contents/%s', rawurlencode($owner), rawurlencode($repo), str_replace('%2F', '/', rawurlencode($path)));
    $response = ddns_accelerator_github_request('PUT', $url, $pat, $payload);

    if ($response['status'] >= 300) {
        $message = 'GitHub API error.';
        if (!empty($response['data']['message'])) {
            $message = $response['data']['message'];
        }
        throw new RuntimeException($message);
    }
}
