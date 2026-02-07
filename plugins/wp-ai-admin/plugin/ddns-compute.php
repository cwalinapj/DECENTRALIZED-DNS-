<?php
/**
 * Plugin Name: DDNS Compute Contribution
 * Description: Provides a Compute Contribution page for running the DDNS miner cache.
 * Version: 0.1.0
 * Author: DECENTRALIZED-DNS
 * Text Domain: ddns-compute
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DDNS_COMPUTE_VERSION', '0.1.0');
define('DDNS_COMPUTE_PATH', plugin_dir_path(__FILE__));
define('DDNS_COMPUTE_URL', plugin_dir_url(__FILE__));

function ddns_compute_register_settings(): void
{
    register_setting(
        'ddns_compute',
        'ddns_compat_control_plane_url',
        array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compute',
        'ddns_compat_api_key',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compute',
        'ddns_compute_cpu_limit',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '1',
        )
    );

    register_setting(
        'ddns_compute',
        'ddns_compute_memory_limit',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '512m',
        )
    );

    register_setting(
        'ddns_compute',
        'ddns_compute_miner_url',
        array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => 'http://localhost:8795',
        )
    );

    register_setting(
        'ddns_compute',
        'ddns_compute_consent',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );
}
add_action('admin_init', 'ddns_compute_register_settings');

function ddns_compute_add_page(): void
{
    add_menu_page(
        'Compute Contribution',
        'Compute Contribution',
        'manage_options',
        'ddns-compute',
        'ddns_compute_render_page',
        'dashicons-admin-generic',
        65
    );
}
add_action('admin_menu', 'ddns_compute_add_page');

function ddns_compute_enqueue_assets(string $hook): void
{
    if ($hook !== 'toplevel_page_ddns-compute') {
        return;
    }

    wp_enqueue_style(
        'ddns-compute-admin',
        DDNS_COMPUTE_URL . 'assets/admin.css',
        array(),
        DDNS_COMPUTE_VERSION
    );

    wp_enqueue_script(
        'ddns-compute-admin',
        DDNS_COMPUTE_URL . 'assets/admin.js',
        array(),
        DDNS_COMPUTE_VERSION,
        true
    );

    $config = array(
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'wpNonce' => wp_create_nonce('ddns_compute_admin'),
    );

    wp_add_inline_script(
        'ddns-compute-admin',
        'window.DDNS_COMPUTE_CFG = ' . wp_json_encode($config) . ';',
        'before'
    );
}
add_action('admin_enqueue_scripts', 'ddns_compute_enqueue_assets');

function ddns_compute_control_plane_url(): string
{
    $url = (string) get_option('ddns_compat_control_plane_url', '');
    return rtrim($url, '/');
}

function ddns_compute_request(string $method, string $path, array $body = null): array
{
    $base = ddns_compute_control_plane_url();
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

function ddns_compute_is_base64(string $value): bool
{
    return !preg_match('/\\s/', $value) && preg_match('/^[A-Za-z0-9+\\/=]+$/', $value);
}

function ddns_compute_render_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }

    $control_plane = esc_attr(get_option('ddns_compat_control_plane_url', ''));
    $api_key = esc_attr(get_option('ddns_compat_api_key', ''));
    $cpu = esc_attr(get_option('ddns_compute_cpu_limit', '1'));
    $memory = esc_attr(get_option('ddns_compute_memory_limit', '512m'));
    $miner_url = esc_attr(get_option('ddns_compute_miner_url', 'http://localhost:8795'));
    $consent = get_option('ddns_compute_consent', '') === '1';
    ?>
    <div class="wrap ddns-compute-admin">
        <h1>Compute Contribution</h1>
        <p>Run the miner cache container locally to contribute compute and earn credits.</p>

        <form method="post" action="options.php">
            <?php settings_fields('ddns_compute'); ?>

            <h2>Control plane connection</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Control plane URL</th>
                    <td>
                        <input class="regular-text" type="url" name="ddns_compat_control_plane_url" value="<?php echo $control_plane; ?>">
                    </td>
                </tr>
                <tr>
                    <th scope="row">API key</th>
                    <td>
                        <input class="regular-text" type="password" name="ddns_compat_api_key" value="<?php echo $api_key; ?>" autocomplete="off">
                    </td>
                </tr>
            </table>

            <h2>Consent</h2>
            <label>
                <input type="checkbox" name="ddns_compute_consent" value="1" <?php checked($consent); ?>>
                I consent to running a local miner cache with the resource limits below.
            </label>

            <h2>Resource caps</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">CPU limit</th>
                    <td>
                        <input class="small-text" type="text" id="ddns-compute-cpu" name="ddns_compute_cpu_limit" value="<?php echo $cpu; ?>">
                        <span class="description">vCPU (example: 1 or 0.5)</span>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Memory limit</th>
                    <td>
                        <input class="small-text" type="text" id="ddns-compute-memory" name="ddns_compute_memory_limit" value="<?php echo $memory; ?>">
                        <span class="description">Memory (example: 512m, 1g)</span>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Miner URL</th>
                    <td>
                        <input class="regular-text" type="url" id="ddns-compute-miner-url" name="ddns_compute_miner_url" value="<?php echo $miner_url; ?>">
                    </td>
                </tr>
            </table>

            <?php submit_button('Save settings'); ?>
        </form>

        <div class="ddns-compute-command">
            <h2>Hardened docker command</h2>
            <textarea id="ddns-compute-command" class="large-text" rows="3" readonly></textarea>
            <button class="button" id="ddns-compute-copy" type="button">Copy command</button>
        </div>

        <div class="ddns-compute-verify">
            <h2>Prove miner running</h2>
            <button class="button button-primary" id="ddns-compute-prove" type="button">Prove miner running</button>
            <div id="ddns-compute-status" class="ddns-compute-status" aria-live="polite"></div>
        </div>
    </div>
    <?php
}

function ddns_compute_ajax_miner_challenge(): void
{
    check_ajax_referer('ddns_compute_admin', 'nonce');

    $response = ddns_compute_request('POST', '/v1/miner-proof/challenge');
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compute_miner_challenge', 'ddns_compute_ajax_miner_challenge');

function ddns_compute_ajax_miner_verify(): void
{
    check_ajax_referer('ddns_compute_admin', 'nonce');

    if (get_option('ddns_compute_consent', '') !== '1') {
        wp_send_json_error(array('message' => 'Consent required before proof.'), 400);
    }

    $nonce = isset($_POST['proof_nonce']) ? sanitize_text_field(wp_unslash($_POST['proof_nonce'])) : '';
    $signature = isset($_POST['signature']) ? wp_unslash($_POST['signature']) : '';
    $public_key = isset($_POST['public_key']) ? wp_unslash($_POST['public_key']) : '';

    if ($nonce === '' || $signature === '' || $public_key === '') {
        wp_send_json_error(array('message' => 'Missing miner proof payload.'), 400);
    }
    if (!ddns_compute_is_base64($signature) || !ddns_compute_is_base64($public_key)) {
        wp_send_json_error(array('message' => 'Invalid miner proof encoding.'), 400);
    }

    $payload = array(
        'nonce' => $nonce,
        'signature' => $signature,
        'public_key' => $public_key,
    );

    $response = ddns_compute_request('POST', '/v1/miner-proof/verify', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compute_miner_verify', 'ddns_compute_ajax_miner_verify');
