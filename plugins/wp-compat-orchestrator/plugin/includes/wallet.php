<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_compat_render_wallet_section(): void
{
    $wallet_address = get_option('ddns_compat_wallet_address', '');
    $wallet_chain = get_option('ddns_compat_wallet_chain', '');
    ?>
    <div class="ddns-compat-wallet">
        <h2>Wallet + payments</h2>
        <p>Connect a wallet in wp-admin to unlock AI repair credits when needed.</p>
        <div class="ddns-compat-wallet-actions">
            <button class="button" id="ddns-compat-wallet-evm">Connect EVM wallet</button>
            <button class="button" id="ddns-compat-wallet-solana">Connect Solana wallet</button>
            <button class="button button-secondary" id="ddns-compat-pay">Pay to unlock AI repair</button>
        </div>
        <div class="ddns-compat-wallet-status" id="ddns-compat-wallet-status">
            <?php if ($wallet_address) : ?>
                <p>Connected: <?php echo esc_html($wallet_chain); ?> <?php echo esc_html($wallet_address); ?></p>
            <?php else : ?>
                <p>No wallet connected yet.</p>
            <?php endif; ?>
        </div>
        <div class="ddns-compat-pay-status" id="ddns-compat-pay-status"></div>
    </div>
    <?php
}

function ddns_compat_ajax_wallet_challenge(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $chain = isset($_POST['chain']) ? sanitize_text_field(wp_unslash($_POST['chain'])) : '';
    $address = isset($_POST['address']) ? sanitize_text_field(wp_unslash($_POST['address'])) : '';

    if ($chain === '' || $address === '') {
        wp_send_json_error(array('message' => 'Missing wallet details.'), 400);
    }

    $payload = array(
        'chain' => $chain,
        'address' => $address,
        'site_id' => get_option('ddns_compat_site_id', ''),
    );

    $response = ddns_compat_request('POST', '/v1/wallets/challenge', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_wallet_challenge', 'ddns_compat_ajax_wallet_challenge');

function ddns_compat_ajax_wallet_verify(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $chain = isset($_POST['chain']) ? sanitize_text_field(wp_unslash($_POST['chain'])) : '';
    $address = isset($_POST['address']) ? sanitize_text_field(wp_unslash($_POST['address'])) : '';
    $message = isset($_POST['message']) ? (string) wp_unslash($_POST['message']) : '';
    $signature = isset($_POST['signature']) ? sanitize_text_field(wp_unslash($_POST['signature'])) : '';

    if ($chain === '' || $address === '' || $message === '' || $signature === '') {
        wp_send_json_error(array('message' => 'Missing signature payload.'), 400);
    }

    $payload = array(
        'chain' => $chain,
        'address' => $address,
        'message' => $message,
        'signature' => $signature,
        'site_id' => get_option('ddns_compat_site_id', ''),
    );

    $response = ddns_compat_request('POST', '/v1/wallets/verify', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    if (!empty($response['data']['session_token'])) {
        update_option('ddns_compat_wallet_session', sanitize_text_field($response['data']['session_token']));
    }
    update_option('ddns_compat_wallet_address', $address);
    update_option('ddns_compat_wallet_chain', $chain);

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_wallet_verify', 'ddns_compat_ajax_wallet_verify');

function ddns_compat_ajax_create_payment(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $session = get_option('ddns_compat_wallet_session', '');
    if ($session === '') {
        wp_send_json_error(array('message' => 'Wallet session missing.'), 400);
    }

    $payload = array(
        'session_token' => $session,
        'reason' => 'ai_repair',
    );

    $response = ddns_compat_request('POST', '/v1/payments/create', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_create_payment', 'ddns_compat_ajax_create_payment');
