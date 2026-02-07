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

function ddns_compat_normalize_wallet_chain(string $chain): string
{
    return strtolower(trim($chain));
}

function ddns_compat_is_supported_wallet_chain(string $chain): bool
{
    return in_array($chain, array('evm', 'solana'), true);
}

function ddns_compat_normalize_wallet_address(string $chain, string $address): string
{
    $normalized = trim($address);
    if ($chain === 'evm') {
        return strtolower($normalized);
    }
    return $normalized;
}

function ddns_compat_link_wallet_to_user(int $user_id, string $chain, string $address): void
{
    update_user_meta($user_id, 'ddns_compat_wallet_chain', $chain);
    update_user_meta($user_id, 'ddns_compat_wallet_address', $address);
}

function ddns_compat_find_wallet_user(string $chain, string $address): ?WP_User
{
    $users = get_users(
        array(
            'number' => 1,
            'meta_query' => array(
                'relation' => 'AND',
                array(
                    'key' => 'ddns_compat_wallet_chain',
                    'value' => $chain,
                    'compare' => '=',
                ),
                array(
                    'key' => 'ddns_compat_wallet_address',
                    'value' => $address,
                    'compare' => '=',
                ),
            ),
        )
    );

    if (empty($users)) {
        return null;
    }

    return $users[0];
}

function ddns_compat_sanitize_login_redirect(string $redirect): string
{
    $redirect = $redirect ? esc_url_raw($redirect) : '';
    return wp_validate_redirect($redirect, admin_url());
}

function ddns_compat_ajax_wallet_challenge(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $chain = isset($_POST['chain']) ? sanitize_text_field(wp_unslash($_POST['chain'])) : '';
    $address = isset($_POST['address']) ? sanitize_text_field(wp_unslash($_POST['address'])) : '';

    $normalized_chain = ddns_compat_normalize_wallet_chain($chain);
    if ($chain === '' || $address === '' || !ddns_compat_is_supported_wallet_chain($normalized_chain)) {
        wp_send_json_error(array('message' => 'Missing wallet details.'), 400);
    }

    $payload = array(
        'chain' => $normalized_chain,
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

    $normalized_chain = ddns_compat_normalize_wallet_chain($chain);
    if ($chain === '' || $address === '' || $message === '' || $signature === '' || !ddns_compat_is_supported_wallet_chain($normalized_chain)) {
        wp_send_json_error(array('message' => 'Missing signature payload.'), 400);
    }

    $payload = array(
        'chain' => $normalized_chain,
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
    $normalized_address = ddns_compat_normalize_wallet_address($normalized_chain, $address);
    $user_id = get_current_user_id();
    if ($user_id) {
        ddns_compat_link_wallet_to_user($user_id, $normalized_chain, $normalized_address);
    }

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

function ddns_compat_render_wallet_login_form(): void
{
    ?>
    <div class="ddns-compat-login-wallet">
        <p><strong>Use a linked wallet to log in.</strong></p>
        <p>
            <button type="button" class="button button-secondary" id="ddns-compat-login-evm">Login with EVM wallet</button>
            <button type="button" class="button button-secondary" id="ddns-compat-login-solana">Login with Solana wallet</button>
        </p>
        <p class="ddns-compat-login-status" id="ddns-compat-login-status" aria-live="polite"></p>
    </div>
    <?php
}
add_action('login_form', 'ddns_compat_render_wallet_login_form');

function ddns_compat_enqueue_login_assets(): void
{
    wp_enqueue_script(
        'ddns-compat-login',
        DDNS_COMPAT_URL . 'assets/admin.js',
        array(),
        DDNS_COMPAT_VERSION,
        true
    );

    $redirect = filter_input(INPUT_GET, 'redirect_to', FILTER_SANITIZE_URL);
    $redirect = is_string($redirect) ? $redirect : '';
    $redirect = ddns_compat_sanitize_login_redirect($redirect);

    $config = array(
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('ddns_compat_login'),
        'redirectUrl' => $redirect,
    );

    wp_add_inline_script(
        'ddns-compat-login',
        'window.DDNS_COMPAT_LOGIN = ' . wp_json_encode($config) . ';',
        'before'
    );
}
add_action('login_enqueue_scripts', 'ddns_compat_enqueue_login_assets');

function ddns_compat_ajax_wallet_login_challenge(): void
{
    check_ajax_referer('ddns_compat_login', 'nonce');

    $chain = isset($_POST['chain']) ? sanitize_text_field(wp_unslash($_POST['chain'])) : '';
    $address = isset($_POST['address']) ? sanitize_text_field(wp_unslash($_POST['address'])) : '';

    $normalized_chain = ddns_compat_normalize_wallet_chain($chain);
    if ($chain === '' || $address === '' || !ddns_compat_is_supported_wallet_chain($normalized_chain)) {
        wp_send_json_error(array('message' => 'Missing wallet details.'), 400);
    }

    $payload = array(
        'chain' => $normalized_chain,
        'address' => $address,
        'site_id' => get_option('ddns_compat_site_id', ''),
    );

    $response = ddns_compat_request('POST', '/v1/wallets/challenge', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_nopriv_ddns_compat_wallet_login_challenge', 'ddns_compat_ajax_wallet_login_challenge');
add_action('wp_ajax_ddns_compat_wallet_login_challenge', 'ddns_compat_ajax_wallet_login_challenge');

function ddns_compat_ajax_wallet_login(): void
{
    check_ajax_referer('ddns_compat_login', 'nonce');

    $chain = isset($_POST['chain']) ? sanitize_text_field(wp_unslash($_POST['chain'])) : '';
    $address = isset($_POST['address']) ? sanitize_text_field(wp_unslash($_POST['address'])) : '';
    $message = isset($_POST['message']) ? (string) wp_unslash($_POST['message']) : '';
    $signature = isset($_POST['signature']) ? sanitize_text_field(wp_unslash($_POST['signature'])) : '';
    $redirect = isset($_POST['redirect']) ? esc_url_raw(wp_unslash($_POST['redirect'])) : '';

    $normalized_chain = ddns_compat_normalize_wallet_chain($chain);
    if ($chain === '' || $address === '' || $message === '' || $signature === '' || !ddns_compat_is_supported_wallet_chain($normalized_chain)) {
        wp_send_json_error(array('message' => 'Missing signature payload.'), 400);
    }

    $payload = array(
        'chain' => $normalized_chain,
        'address' => $address,
        'message' => $message,
        'signature' => $signature,
        'site_id' => get_option('ddns_compat_site_id', ''),
    );

    $response = ddns_compat_request('POST', '/v1/wallets/verify', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    $normalized_address = ddns_compat_normalize_wallet_address($normalized_chain, $address);
    $user = ddns_compat_find_wallet_user($normalized_chain, $normalized_address);
    if (!$user) {
        wp_send_json_error(array('message' => 'Wallet not linked to a user.'), 403);
    }

    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);
    do_action('wp_login', $user->user_login, $user);

    $redirect = ddns_compat_sanitize_login_redirect($redirect);

    wp_send_json_success(
        array(
            'redirect' => $redirect,
        )
    );
}
add_action('wp_ajax_nopriv_ddns_compat_wallet_login', 'ddns_compat_ajax_wallet_login');
add_action('wp_ajax_ddns_compat_wallet_login', 'ddns_compat_ajax_wallet_login');
