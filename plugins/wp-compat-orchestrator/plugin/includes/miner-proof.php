<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_compat_render_miner_proof_section(): void
{
    ?>
    <div class="ddns-compat-miner-proof">
        <h2>Miner proof (free credits)</h2>
        <p>Host the DNS miner to unlock free compatibility credits.</p>
        <label for="ddns-compat-miner-token">Miner proof token</label>
        <input type="text" id="ddns-compat-miner-token" class="regular-text" placeholder="proof_...">
        <button class="button" id="ddns-compat-miner-verify">Verify miner proof</button>
        <div class="ddns-compat-miner-status" id="ddns-compat-miner-status"></div>
    </div>
    <?php
}

function ddns_compat_ajax_miner_proof(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $token = isset($_POST['token']) ? sanitize_text_field(wp_unslash($_POST['token'])) : '';
    if ($token === '') {
        wp_send_json_error(array('message' => 'Missing proof token.'), 400);
    }

    $payload = array(
        'token' => $token,
        'site_id' => get_option('ddns_compat_site_id', ''),
    );

    $response = ddns_compat_request('POST', '/v1/miner-proof/verify', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_miner_proof', 'ddns_compat_ajax_miner_proof');
