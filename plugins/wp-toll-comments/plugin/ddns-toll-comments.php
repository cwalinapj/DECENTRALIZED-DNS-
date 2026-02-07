<?php
/**
 * Plugin Name: DDNS Toll Comments
 * Description: Requires an onchain escrow payment before comments are accepted.
 * Version: 0.1.0
 * Author: DECENTRALIZED-DNS
 * Text Domain: ddns-toll-comments
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DDNS_TOLL_COMMENTS_VERSION', '0.1.0');
define('DDNS_TOLL_COMMENTS_PATH', plugin_dir_path(__FILE__));
define('DDNS_TOLL_COMMENTS_URL', plugin_dir_url(__FILE__));
define('DDNS_TOLL_COMMENTS_INTENT_TTL', 30 * MINUTE_IN_SECONDS);

if (!defined('DDNS_TOLL_COMMENTS_MOCK_TX_HASH')) {
    define('DDNS_TOLL_COMMENTS_MOCK_TX_HASH', '');
}

register_activation_hook(__FILE__, 'ddns_toll_comments_install');

function ddns_toll_comments_table_tolls(): string
{
    global $wpdb;
    return $wpdb->prefix . 'ddns_comment_tolls';
}

function ddns_toll_comments_table_wallets(): string
{
    global $wpdb;
    return $wpdb->prefix . 'ddns_wallet_lists';
}

function ddns_toll_comments_install(): void
{
    global $wpdb;

    $charset_collate = $wpdb->get_charset_collate();
    $tolls_table = ddns_toll_comments_table_tolls();
    $wallets_table = ddns_toll_comments_table_wallets();

    $tolls_sql = "CREATE TABLE {$tolls_table} (
        intent_id varchar(64) NOT NULL,
        tx_hash varchar(120) NOT NULL,
        wallet varchar(120) NOT NULL,
        amount varchar(64) NOT NULL,
        chain_id varchar(32) NOT NULL,
        status varchar(32) NOT NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (intent_id),
        UNIQUE KEY tx_hash (tx_hash)
    ) {$charset_collate};";

    $wallets_sql = "CREATE TABLE {$wallets_table} (
        wallet varchar(120) NOT NULL,
        list_type varchar(16) NOT NULL,
        note text NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (wallet, list_type)
    ) {$charset_collate};";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($tolls_sql);
    dbDelta($wallets_sql);
}

function ddns_toll_comments_is_enabled(): bool
{
    return (bool) get_option('ddns_toll_comments_enabled', false);
}

function ddns_toll_comments_sanitize_bool($value): int
{
    return $value ? 1 : 0;
}

function ddns_toll_comments_register_settings(): void
{
    register_setting('ddns_toll_comments', 'ddns_toll_comments_enabled', array(
        'type' => 'boolean',
        'sanitize_callback' => 'ddns_toll_comments_sanitize_bool',
        'default' => false,
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_chain', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => 'EVM',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_chain_id', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '1',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_rpc_url', array(
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default' => '',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_token', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => 'NATIVE',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_toll_amount', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '0',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_treasury_address', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_escrow_contract_address', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_use_control_plane_relayer', array(
        'type' => 'boolean',
        'sanitize_callback' => 'ddns_toll_comments_sanitize_bool',
        'default' => true,
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_control_plane_url', array(
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default' => '',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_site_token', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '',
    ));

    register_setting('ddns_toll_comments', 'ddns_toll_comments_walletconnect_project_id', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '',
    ));

    add_settings_section(
        'ddns_toll_comments_main',
        'Toll settings',
        '__return_false',
        'ddns-toll-comments'
    );

    add_settings_field(
        'ddns_toll_comments_enabled',
        'Enabled',
        'ddns_toll_comments_render_enabled_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_field(
        'ddns_toll_comments_chain',
        'Chain',
        'ddns_toll_comments_render_chain_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_field(
        'ddns_toll_comments_chain_id',
        'Chain ID',
        'ddns_toll_comments_render_chain_id_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_field(
        'ddns_toll_comments_rpc_url',
        'RPC URL',
        'ddns_toll_comments_render_rpc_url_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_field(
        'ddns_toll_comments_token',
        'Token',
        'ddns_toll_comments_render_token_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_field(
        'ddns_toll_comments_toll_amount',
        'Toll amount',
        'ddns_toll_comments_render_amount_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_field(
        'ddns_toll_comments_treasury_address',
        'Treasury address',
        'ddns_toll_comments_render_treasury_field',
        'ddns-toll-comments',
        'ddns_toll_comments_main'
    );

    add_settings_section(
        'ddns_toll_comments_escrow',
        'Escrow settings',
        '__return_false',
        'ddns-toll-comments'
    );

    add_settings_field(
        'ddns_toll_comments_escrow_contract_address',
        'Escrow contract address',
        'ddns_toll_comments_render_escrow_field',
        'ddns-toll-comments',
        'ddns_toll_comments_escrow'
    );

    add_settings_section(
        'ddns_toll_comments_relayer',
        'Relayer',
        '__return_false',
        'ddns-toll-comments'
    );

    add_settings_field(
        'ddns_toll_comments_use_control_plane_relayer',
        'Use control-plane relayer',
        'ddns_toll_comments_render_relayer_toggle',
        'ddns-toll-comments',
        'ddns_toll_comments_relayer'
    );

    add_settings_field(
        'ddns_toll_comments_control_plane_url',
        'Control-plane URL',
        'ddns_toll_comments_render_relayer_url_field',
        'ddns-toll-comments',
        'ddns_toll_comments_relayer'
    );

    add_settings_field(
        'ddns_toll_comments_site_token',
        'Site token',
        'ddns_toll_comments_render_site_token_field',
        'ddns-toll-comments',
        'ddns_toll_comments_relayer'
    );

    add_settings_section(
        'ddns_toll_comments_walletconnect',
        'WalletConnect',
        '__return_false',
        'ddns-toll-comments'
    );

    add_settings_field(
        'ddns_toll_comments_walletconnect_project_id',
        'Project ID',
        'ddns_toll_comments_render_walletconnect_field',
        'ddns-toll-comments',
        'ddns_toll_comments_walletconnect'
    );
}
add_action('admin_init', 'ddns_toll_comments_register_settings');

function ddns_toll_comments_add_settings_page(): void
{
    add_options_page(
        'DDNS Toll Comments',
        'DDNS Toll Comments',
        'manage_options',
        'ddns-toll-comments',
        'ddns_toll_comments_render_settings_page'
    );
}
add_action('admin_menu', 'ddns_toll_comments_add_settings_page');

function ddns_toll_comments_render_enabled_field(): void
{
    $value = (bool) get_option('ddns_toll_comments_enabled', false);
    echo '<label><input type="checkbox" name="ddns_toll_comments_enabled" value="1" ' . checked($value, true, false) . '> Require onchain toll for comments</label>';
}

function ddns_toll_comments_render_chain_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_chain', 'EVM'));
    echo '<input class="regular-text" type="text" name="ddns_toll_comments_chain" value="' . $value . '" readonly aria-readonly="true">';
}

function ddns_toll_comments_render_chain_id_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_chain_id', '1'));
    echo '<input class="small-text" type="text" name="ddns_toll_comments_chain_id" value="' . $value . '">';
}

function ddns_toll_comments_render_rpc_url_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_rpc_url', ''));
    echo '<input class="regular-text" type="url" name="ddns_toll_comments_rpc_url" value="' . $value . '" placeholder="https://rpc.example.com">';
}

function ddns_toll_comments_render_token_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_token', 'NATIVE'));
    echo '<select name="ddns_toll_comments_token">';
    echo '<option value="NATIVE" ' . selected($value, 'NATIVE', false) . '>NATIVE (ETH)</option>';
    echo '<option value="USDC" ' . selected($value, 'USDC', false) . '>USDC</option>';
    echo '</select>';
}

function ddns_toll_comments_render_amount_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_toll_amount', '0'));
    echo '<input class="regular-text" type="text" name="ddns_toll_comments_toll_amount" value="' . $value . '" placeholder="1000000000000000">';
    echo '<p class="description">Enter wei (integer) or ETH decimal amount.</p>';
}

function ddns_toll_comments_render_treasury_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_treasury_address', ''));
    echo '<input class="regular-text" type="text" name="ddns_toll_comments_treasury_address" value="' . $value . '" placeholder="0x...">';
}

function ddns_toll_comments_render_escrow_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_escrow_contract_address', ''));
    echo '<input class="regular-text" type="text" name="ddns_toll_comments_escrow_contract_address" value="' . $value . '" placeholder="0x...">';
    echo '<p class="description">Deposits target this escrow contract; refunds/forfeits are sent by the relayer.</p>';
}

function ddns_toll_comments_render_relayer_toggle(): void
{
    $value = (bool) get_option('ddns_toll_comments_use_control_plane_relayer', true);
    echo '<label><input type="checkbox" name="ddns_toll_comments_use_control_plane_relayer" value="1" ' . checked($value, true, false) . '> Enable control-plane relayer</label>';
    echo '<p class="description">Refund operator private key is managed by the control plane, not stored in WordPress.</p>';
}

function ddns_toll_comments_render_relayer_url_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_control_plane_url', ''));
    echo '<input class="regular-text" type="url" name="ddns_toll_comments_control_plane_url" value="' . $value . '" placeholder="https://control.example.com">';
}

function ddns_toll_comments_render_site_token_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_site_token', ''));
    echo '<input class="regular-text" type="password" name="ddns_toll_comments_site_token" value="' . $value . '" autocomplete="off">';
}

function ddns_toll_comments_render_walletconnect_field(): void
{
    $value = esc_attr(get_option('ddns_toll_comments_walletconnect_project_id', ''));
    echo '<input class="regular-text" type="text" name="ddns_toll_comments_walletconnect_project_id" value="' . $value . '" placeholder="WalletConnect project ID">';
    echo '<p class="description">Required to display WalletConnect QR modal.</p>';
}

function ddns_toll_comments_render_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>DDNS Toll Comments</h1>
        <form method="post" action="options.php">
            <?php settings_fields('ddns_toll_comments'); ?>
            <?php do_settings_sections('ddns-toll-comments'); ?>
            <?php submit_button('Save settings'); ?>
        </form>
        <p class="description">Use DDNS_TOLL_COMMENTS_MOCK_TX_HASH in wp-config.php for local mock verification (requires WP_DEBUG).</p>
    </div>
    <?php
}

function ddns_toll_comments_enqueue_assets(): void
{
    if (!ddns_toll_comments_is_enabled()) {
        return;
    }

    if (!is_singular() || !comments_open()) {
        return;
    }

    wp_enqueue_script(
        'ddns-toll-comments-ethers',
        'https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js',
        array(),
        '6.13.2',
        true
    );
    wp_script_add_data('ddns-toll-comments-ethers', 'integrity', 'sha384-gpR0Q6Hx/O+uevlbpbANbS0LWjbejPV1sqD/8w422l/fW8whGY0EPmKw3uG7ACYP');
    wp_script_add_data('ddns-toll-comments-ethers', 'crossorigin', 'anonymous');

    wp_enqueue_script(
        'ddns-toll-comments-walletconnect',
        'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.2/dist/index.umd.js',
        array(),
        '2.11.2',
        true
    );
    wp_script_add_data('ddns-toll-comments-walletconnect', 'integrity', 'sha384-gPfW0XsoEs9ST0ZO7onN2jJRJ1xBztd2J6anJzd1atUC7i+Dhy7H8JD1HQwJrurT');
    wp_script_add_data('ddns-toll-comments-walletconnect', 'crossorigin', 'anonymous');

    wp_enqueue_script(
        'ddns-toll-comments',
        DDNS_TOLL_COMMENTS_URL . 'assets/comment-form.js',
        array('ddns-toll-comments-ethers', 'ddns-toll-comments-walletconnect'),
        DDNS_TOLL_COMMENTS_VERSION,
        true
    );

    $config = array(
        'chainId' => (int) get_option('ddns_toll_comments_chain_id', '1'),
        'rpcUrl' => (string) get_option('ddns_toll_comments_rpc_url', ''),
        'token' => (string) get_option('ddns_toll_comments_token', 'NATIVE'),
        'tollAmount' => (string) get_option('ddns_toll_comments_toll_amount', '0'),
        'treasuryAddress' => (string) get_option('ddns_toll_comments_treasury_address', ''),
        'escrowContract' => (string) get_option('ddns_toll_comments_escrow_contract_address', ''),
        'walletConnectProjectId' => (string) get_option('ddns_toll_comments_walletconnect_project_id', ''),
    );

    wp_add_inline_script(
        'ddns-toll-comments',
        'window.DDNS_TOLL_COMMENTS_CONFIG = ' . wp_json_encode($config) . ';',
        'before'
    );
}
add_action('wp_enqueue_scripts', 'ddns_toll_comments_enqueue_assets');

function ddns_toll_comments_current_intent_id(): string
{
    static $intent_id = '';
    if ($intent_id !== '') {
        return $intent_id;
    }
    $intent_id = 'intent_' . wp_generate_uuid4();
    set_transient('ddns_toll_intent_' . $intent_id, '1', DDNS_TOLL_COMMENTS_INTENT_TTL);
    return $intent_id;
}

function ddns_toll_comments_render_form_fields(): void
{
    if (!ddns_toll_comments_is_enabled()) {
        return;
    }

    $intent_id = ddns_toll_comments_current_intent_id();
    $nonce = wp_create_nonce('ddns_toll_intent_' . $intent_id);
    ?>
    <input type="hidden" name="ddns_toll_wallet" id="ddns-toll-wallet" value="">
    <input type="hidden" name="ddns_toll_tx_hash" id="ddns-toll-tx-hash" value="">
    <input type="hidden" name="ddns_toll_intent_id" id="ddns-toll-intent" value="<?php echo esc_attr($intent_id); ?>">
    <input type="hidden" name="ddns_toll_intent_nonce" value="<?php echo esc_attr($nonce); ?>">
    <?php
}
add_action('comment_form_after_fields', 'ddns_toll_comments_render_form_fields');
add_action('comment_form_logged_in_after', 'ddns_toll_comments_render_form_fields');

function ddns_toll_comments_render_form_controls(): void
{
    if (!ddns_toll_comments_is_enabled()) {
        return;
    }
    ?>
    <div class="ddns-toll-comments">
        <p><strong>Onchain comment toll</strong></p>
        <button type="button" class="button" id="ddns-toll-connect">Connect Wallet</button>
        <button type="button" class="button" id="ddns-toll-pay">Pay toll</button>
        <span id="ddns-toll-status" class="ddns-toll-status" aria-live="polite"></span>
    </div>
    <?php
}
add_action('comment_form_after', 'ddns_toll_comments_render_form_controls');

function ddns_toll_comments_wallet_in_list(string $wallet, string $list_type): bool
{
    global $wpdb;
    $wallet = strtolower($wallet);
    $table = ddns_toll_comments_table_wallets();
    $result = $wpdb->get_var(
        $wpdb->prepare("SELECT wallet FROM {$table} WHERE wallet = %s AND list_type = %s", $wallet, $list_type)
    );
    return !empty($result);
}

function ddns_toll_comments_tx_used(string $tx_hash): bool
{
    global $wpdb;
    $table = ddns_toll_comments_table_tolls();
    $result = $wpdb->get_var(
        $wpdb->prepare("SELECT tx_hash FROM {$table} WHERE tx_hash = %s", $tx_hash)
    );
    return !empty($result);
}

function ddns_toll_comments_hex_to_dec(string $hex): string
{
    $hex = strtolower(ltrim($hex, '0x'));
    if ($hex === '') {
        return '0';
    }
    $dec = '0';
    foreach (str_split($hex) as $char) {
        $dec = ddns_toll_comments_decimal_mul($dec, 16);
        $dec = ddns_toll_comments_decimal_add($dec, hexdec($char));
    }
    return $dec;
}

function ddns_toll_comments_decimal_add(string $value, int $add): string
{
    $carry = $add;
    $result = '';
    for ($i = strlen($value) - 1; $i >= 0; $i--) {
        $sum = intval($value[$i]) + $carry;
        $result = strval($sum % 10) . $result;
        $carry = intdiv($sum, 10);
    }
    while ($carry > 0) {
        $result = strval($carry % 10) . $result;
        $carry = intdiv($carry, 10);
    }
    $result = ltrim($result, '0');
    return $result === '' ? '0' : $result;
}

function ddns_toll_comments_decimal_mul(string $value, int $multiplier): string
{
    if ($value === '0') {
        return '0';
    }
    $carry = 0;
    $result = '';
    for ($i = strlen($value) - 1; $i >= 0; $i--) {
        $product = intval($value[$i]) * $multiplier + $carry;
        $result = strval($product % 10) . $result;
        $carry = intdiv($product, 10);
    }
    while ($carry > 0) {
        $result = strval($carry % 10) . $result;
        $carry = intdiv($carry, 10);
    }
    $result = ltrim($result, '0');
    return $result === '' ? '0' : $result;
}

function ddns_toll_comments_decimal_compare(string $left, string $right): int
{
    $left = ltrim($left, '0');
    $right = ltrim($right, '0');
    if ($left === '') {
        $left = '0';
    }
    if ($right === '') {
        $right = '0';
    }
    if (strlen($left) !== strlen($right)) {
        return strlen($left) < strlen($right) ? -1 : 1;
    }
    if ($left === $right) {
        return 0;
    }
    return $left < $right ? -1 : 1;
}

function ddns_toll_comments_normalize_amount(string $amount): string
{
    $amount = trim($amount);
    if ($amount === '') {
        return '0';
    }
    if (strpos($amount, '.') === false) {
        return ltrim($amount, '0') === '' ? '0' : ltrim($amount, '0');
    }
    $parts = explode('.', $amount, 2);
    $whole = ltrim($parts[0], '0');
    $whole = $whole === '' ? '0' : $whole;
    $fraction = rtrim($parts[1], '0');
    if ($fraction === '') {
        return $whole;
    }
    if (strlen($fraction) > 18) {
        $fraction = substr($fraction, 0, 18);
    }
    $fraction = str_pad($fraction, 18, '0');
    $wei = $whole === '0' ? $fraction : $whole . $fraction;
    $wei = ltrim($wei, '0');
    return $wei === '' ? '0' : $wei;
}

function ddns_toll_comments_verify_payment(string $tx_hash, string $wallet): array
{
    $mock_hash = strtolower(DDNS_TOLL_COMMENTS_MOCK_TX_HASH);
    $mock_enabled = defined('WP_DEBUG') && WP_DEBUG;
    if ($mock_enabled && $mock_hash !== '' && strtolower($tx_hash) === $mock_hash) {
        return array(
            'ok' => true,
            'status' => 'mocked',
            'amount' => (string) get_option('ddns_toll_comments_toll_amount', '0'),
            'chain_id' => (string) get_option('ddns_toll_comments_chain_id', '1'),
        );
    }

    $rpc_url = (string) get_option('ddns_toll_comments_rpc_url', '');
    if ($rpc_url === '') {
        return array('ok' => false, 'error' => 'RPC URL not configured.');
    }

    $token = (string) get_option('ddns_toll_comments_token', 'NATIVE');
    if ($token !== 'NATIVE') {
        return array('ok' => false, 'error' => 'Token verification not configured.');
    }

    $payload = array(
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'eth_getTransactionByHash',
        'params' => array($tx_hash),
    );

    $response = wp_remote_post($rpc_url, array(
        'timeout' => 20,
        'headers' => array('Content-Type' => 'application/json'),
        'body' => wp_json_encode($payload),
    ));

    if (is_wp_error($response)) {
        return array('ok' => false, 'error' => $response->get_error_message());
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);
    $tx = $body['result'] ?? null;
    if (!$tx || empty($tx['to'])) {
        return array('ok' => false, 'error' => 'Transaction not found.');
    }

    $expected_to = (string) get_option('ddns_toll_comments_escrow_contract_address', '');
    if ($expected_to === '') {
        $expected_to = (string) get_option('ddns_toll_comments_treasury_address', '');
    }

    if ($expected_to === '') {
        return array('ok' => false, 'error' => 'Payment target not configured.');
    }

    if (strtolower($tx['to']) !== strtolower($expected_to)) {
        return array('ok' => false, 'error' => 'Payment did not target configured address.');
    }

    if (!empty($tx['from']) && strtolower($tx['from']) !== strtolower($wallet)) {
        return array('ok' => false, 'error' => 'Wallet mismatch.');
    }

    $receipt_payload = array(
        'jsonrpc' => '2.0',
        'id' => 2,
        'method' => 'eth_getTransactionReceipt',
        'params' => array($tx_hash),
    );
    $receipt_response = wp_remote_post($rpc_url, array(
        'timeout' => 20,
        'headers' => array('Content-Type' => 'application/json'),
        'body' => wp_json_encode($receipt_payload),
    ));
    if (is_wp_error($receipt_response)) {
        return array('ok' => false, 'error' => $receipt_response->get_error_message());
    }
    $receipt_body = json_decode(wp_remote_retrieve_body($receipt_response), true);
    $receipt = $receipt_body['result'] ?? null;
    if (!$receipt || (isset($receipt['status']) && $receipt['status'] !== '0x1')) {
        return array('ok' => false, 'error' => 'Transaction not confirmed.');
    }

    $value = isset($tx['value']) ? ddns_toll_comments_hex_to_dec($tx['value']) : '0';
    $expected_amount = ddns_toll_comments_normalize_amount((string) get_option('ddns_toll_comments_toll_amount', '0'));
    if (ddns_toll_comments_decimal_compare($value, $expected_amount) < 0) {
        return array('ok' => false, 'error' => 'Payment amount too low.');
    }

    return array(
        'ok' => true,
        'status' => 'verified',
        'amount' => $expected_amount,
        'chain_id' => (string) get_option('ddns_toll_comments_chain_id', '1'),
    );
}

function ddns_toll_comments_record_payment(string $intent_id, string $tx_hash, string $wallet, string $amount, string $chain_id, string $status): void
{
    global $wpdb;
    $table = ddns_toll_comments_table_tolls();
    $wpdb->insert(
        $table,
        array(
            'intent_id' => $intent_id,
            'tx_hash' => $tx_hash,
            'wallet' => strtolower($wallet),
            'amount' => $amount,
            'chain_id' => $chain_id,
            'status' => $status,
            'created_at' => current_time('mysql', true),
        ),
        array('%s', '%s', '%s', '%s', '%s', '%s', '%s')
    );
}

function ddns_toll_comments_update_status(string $intent_id, string $status): void
{
    global $wpdb;
    $table = ddns_toll_comments_table_tolls();
    $wpdb->update(
        $table,
        array('status' => $status),
        array('intent_id' => $intent_id),
        array('%s'),
        array('%s')
    );
}

function ddns_toll_comments_preprocess_comment(array $commentdata): array
{
    if (!ddns_toll_comments_is_enabled()) {
        return $commentdata;
    }

    $intent_id = isset($_POST['ddns_toll_intent_id']) ? sanitize_text_field(wp_unslash($_POST['ddns_toll_intent_id'])) : '';
    $nonce = isset($_POST['ddns_toll_intent_nonce']) ? sanitize_text_field(wp_unslash($_POST['ddns_toll_intent_nonce'])) : '';
    if ($intent_id === '' || $nonce === '' || !wp_verify_nonce($nonce, 'ddns_toll_intent_' . $intent_id)) {
        wp_die('Payment intent missing or invalid.');
    }

    if (!get_transient('ddns_toll_intent_' . $intent_id)) {
        wp_die('Payment intent expired.');
    }

    $wallet = isset($_POST['ddns_toll_wallet']) ? sanitize_text_field(wp_unslash($_POST['ddns_toll_wallet'])) : '';
    $tx_hash = isset($_POST['ddns_toll_tx_hash']) ? sanitize_text_field(wp_unslash($_POST['ddns_toll_tx_hash'])) : '';

    if ($wallet !== '' && ddns_toll_comments_wallet_in_list($wallet, 'deny')) {
        wp_die('Your wallet address has been denied from posting comments. Please contact the site administrator.');
    }

    if ($wallet !== '' && ddns_toll_comments_wallet_in_list($wallet, 'allow')) {
        return $commentdata;
    }

    if ($wallet === '' || $tx_hash === '') {
        wp_die('Please complete the comment toll payment before posting.');
    }

    if (ddns_toll_comments_tx_used($tx_hash)) {
        wp_die('Transaction already used.');
    }

    $verification = ddns_toll_comments_verify_payment($tx_hash, $wallet);
    if (!$verification['ok']) {
        wp_die('Payment verification failed: ' . esc_html($verification['error'] ?? 'unknown'));
    }

    ddns_toll_comments_record_payment(
        $intent_id,
        $tx_hash,
        $wallet,
        (string) $verification['amount'],
        (string) $verification['chain_id'],
        (string) $verification['status']
    );

    $GLOBALS['ddns_toll_comments_last_payment'] = array(
        'intent_id' => $intent_id,
        'tx_hash' => $tx_hash,
        'wallet' => $wallet,
        'amount' => (string) $verification['amount'],
        'chain_id' => (string) $verification['chain_id'],
    );

    delete_transient('ddns_toll_intent_' . $intent_id);

    return $commentdata;
}
add_filter('preprocess_comment', 'ddns_toll_comments_preprocess_comment');

function ddns_toll_comments_store_comment_meta(int $comment_id): void
{
    $payment = $GLOBALS['ddns_toll_comments_last_payment'] ?? null;
    if (!$payment || empty($payment['intent_id'])) {
        return;
    }

    add_comment_meta($comment_id, 'ddns_toll_intent_id', $payment['intent_id'], true);
    add_comment_meta($comment_id, 'ddns_toll_tx_hash', $payment['tx_hash'], true);
    add_comment_meta($comment_id, 'ddns_toll_wallet', $payment['wallet'], true);
    add_comment_meta($comment_id, 'ddns_toll_amount', $payment['amount'], true);
    add_comment_meta($comment_id, 'ddns_toll_chain_id', $payment['chain_id'], true);
}
add_action('comment_post', 'ddns_toll_comments_store_comment_meta', 10, 1);

function ddns_toll_comments_add_comment_meta_box(): void
{
    add_meta_box(
        'ddns-toll-bonus',
        'Toll refund bonus',
        'ddns_toll_comments_render_comment_bonus_box',
        'comment',
        'side'
    );
}
add_action('add_meta_boxes_comment', 'ddns_toll_comments_add_comment_meta_box');

function ddns_toll_comments_render_comment_bonus_box($comment): void
{
    $value = esc_attr(get_comment_meta($comment->comment_ID, 'ddns_toll_refund_bonus', true));
    wp_nonce_field('ddns_toll_bonus', 'ddns_toll_bonus_nonce');
    echo '<p><label for="ddns_toll_refund_bonus">Bonus amount (wei)</label></p>';
    echo '<input type="text" class="widefat" id="ddns_toll_refund_bonus" name="ddns_toll_refund_bonus" value="' . $value . '">';
    echo '<p class="description">Optional extra refund paid by the operator.</p>';
}

function ddns_toll_comments_save_comment_bonus(int $comment_id): void
{
    if (!isset($_POST['ddns_toll_bonus_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['ddns_toll_bonus_nonce'])), 'ddns_toll_bonus')) {
        return;
    }
    if (!current_user_can('edit_comment', $comment_id)) {
        return;
    }
    if (isset($_POST['ddns_toll_refund_bonus'])) {
        $bonus = sanitize_text_field(wp_unslash($_POST['ddns_toll_refund_bonus']));
        update_comment_meta($comment_id, 'ddns_toll_refund_bonus', $bonus);
    }
}
add_action('edit_comment', 'ddns_toll_comments_save_comment_bonus');

function ddns_toll_comments_build_signature(string $action, array $payload, string $token): string
{
    $parts = array(
        $action,
        (string) ($payload['comment_id'] ?? ''),
        (string) ($payload['intent_id'] ?? ''),
        (string) ($payload['wallet'] ?? ''),
        (string) ($payload['amount'] ?? ''),
        (string) ($payload['chain_id'] ?? ''),
        (string) ($payload['tx_hash'] ?? ''),
        (string) ($payload['bonus_amount'] ?? ''),
    );
    return hash_hmac('sha256', implode('|', $parts), $token);
}

function ddns_toll_comments_send_relayer_request(string $action, array $payload): array
{
    $use_relayer = (bool) get_option('ddns_toll_comments_use_control_plane_relayer', true);
    if (!$use_relayer) {
        return array('ok' => false, 'error' => 'Relayer disabled.');
    }

    $base_url = rtrim((string) get_option('ddns_toll_comments_control_plane_url', ''), '/');
    $site_token = (string) get_option('ddns_toll_comments_site_token', '');
    if ($base_url === '' || $site_token === '') {
        return array('ok' => false, 'error' => 'Control-plane not configured.');
    }

    $payload['signature'] = ddns_toll_comments_build_signature($action, $payload, $site_token);

    $response = wp_remote_post(
        $base_url . '/v1/toll-comments/' . $action,
        array(
            'timeout' => 20,
            'headers' => array(
                'Content-Type' => 'application/json',
                'x-ddns-site-token' => $site_token,
            ),
            'body' => wp_json_encode($payload),
        )
    );

    if (is_wp_error($response)) {
        return array('ok' => false, 'error' => $response->get_error_message());
    }

    $status = wp_remote_retrieve_response_code($response);
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if ($status < 200 || $status >= 300) {
        return array('ok' => false, 'error' => $data['error'] ?? 'Relayer error');
    }

    return array('ok' => true, 'tx_hash' => $data['tx_hash'] ?? '');
}

function ddns_toll_comments_transition_comment_status(string $new_status, string $old_status, $comment): void
{
    if (!ddns_toll_comments_is_enabled()) {
        return;
    }

    $intent_id = get_comment_meta($comment->comment_ID, 'ddns_toll_intent_id', true);
    $wallet = get_comment_meta($comment->comment_ID, 'ddns_toll_wallet', true);
    $tx_hash = get_comment_meta($comment->comment_ID, 'ddns_toll_tx_hash', true);
    $amount = get_comment_meta($comment->comment_ID, 'ddns_toll_amount', true);
    $chain_id = get_comment_meta($comment->comment_ID, 'ddns_toll_chain_id', true);

    if ($intent_id === '' || $wallet === '' || $tx_hash === '') {
        return;
    }

    if ($old_status === 'pending' && $new_status === 'approved') {
        $bonus_amount = get_comment_meta($comment->comment_ID, 'ddns_toll_refund_bonus', true);
        $payload = array(
            'comment_id' => (string) $comment->comment_ID,
            'intent_id' => (string) $intent_id,
            'wallet' => (string) $wallet,
            'amount' => (string) $amount,
            'chain_id' => (string) $chain_id,
            'tx_hash' => (string) $tx_hash,
            'bonus_amount' => (string) $bonus_amount,
        );
        $result = ddns_toll_comments_send_relayer_request('refund', $payload);
        if ($result['ok'] && !empty($result['tx_hash'])) {
            update_comment_meta($comment->comment_ID, 'ddns_toll_refund_tx_hash', $result['tx_hash']);
            ddns_toll_comments_update_status($intent_id, 'refunded');
        }
        return;
    }

    if (in_array($new_status, array('spam', 'trash'), true)) {
        $payload = array(
            'comment_id' => (string) $comment->comment_ID,
            'intent_id' => (string) $intent_id,
            'wallet' => (string) $wallet,
            'amount' => (string) $amount,
            'chain_id' => (string) $chain_id,
            'tx_hash' => (string) $tx_hash,
        );
        $result = ddns_toll_comments_send_relayer_request('forfeit', $payload);
        if ($result['ok'] && !empty($result['tx_hash'])) {
            update_comment_meta($comment->comment_ID, 'ddns_toll_forfeit_tx_hash', $result['tx_hash']);
            ddns_toll_comments_update_status($intent_id, 'forfeited');
        }
    }
}
add_action('transition_comment_status', 'ddns_toll_comments_transition_comment_status', 10, 3);
