<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_compat_default_site_id(): string
{
    $host = wp_parse_url(home_url(), PHP_URL_HOST);
    if (!$host) {
        return 'site_' . wp_generate_uuid4();
    }
    return 'site_' . preg_replace('/[^a-z0-9_-]/i', '_', $host);
}

function ddns_compat_register_settings(): void
{
    register_setting(
        'ddns_compat',
        'ddns_compat_control_plane_url',
        array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_api_key',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_site_id',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => ddns_compat_default_site_id(),
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_last_job_id',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_last_report',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_textarea_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_wallet_session',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_wallet_address',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    register_setting(
        'ddns_compat',
        'ddns_compat_wallet_chain',
        array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        )
    );

    add_settings_section(
        'ddns_compat_connection',
        'Staging connection',
        '__return_false',
        'ddns-compat'
    );

    add_settings_field(
        'ddns_compat_control_plane_url',
        'Control plane URL',
        'ddns_compat_render_control_plane_field',
        'ddns-compat',
        'ddns_compat_connection'
    );

    add_settings_field(
        'ddns_compat_api_key',
        'API key',
        'ddns_compat_render_api_key_field',
        'ddns-compat',
        'ddns_compat_connection'
    );

    add_settings_field(
        'ddns_compat_site_id',
        'Site ID',
        'ddns_compat_render_site_id_field',
        'ddns-compat',
        'ddns_compat_connection'
    );
}
add_action('admin_init', 'ddns_compat_register_settings');

function ddns_compat_add_settings_page(): void
{
    add_options_page(
        'DDNS Compat',
        'DDNS Compat',
        'manage_options',
        'ddns-compat',
        'ddns_compat_render_settings_page'
    );
}
add_action('admin_menu', 'ddns_compat_add_settings_page');

function ddns_compat_enqueue_admin_assets(string $hook): void
{
    if ($hook !== 'settings_page_ddns-compat') {
        return;
    }

    wp_enqueue_style(
        'ddns-compat-admin',
        DDNS_COMPAT_URL . 'assets/admin.css',
        array(),
        DDNS_COMPAT_VERSION
    );

    wp_enqueue_script(
        'ddns-compat-admin',
        DDNS_COMPAT_URL . 'assets/admin.js',
        array(),
        DDNS_COMPAT_VERSION,
        true
    );

    $config = array(
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('ddns_compat_admin'),
        'siteId' => get_option('ddns_compat_site_id', ''),
        'lastJobId' => get_option('ddns_compat_last_job_id', ''),
    );

    wp_add_inline_script(
        'ddns-compat-admin',
        'window.DDNS_COMPAT_ADMIN = ' . wp_json_encode($config) . ';',
        'before'
    );
}
add_action('admin_enqueue_scripts', 'ddns_compat_enqueue_admin_assets');

function ddns_compat_render_control_plane_field(): void
{
    $value = esc_attr(get_option('ddns_compat_control_plane_url', ''));
    echo '<input class="regular-text" type="url" name="ddns_compat_control_plane_url" '
        . 'value="' . $value . '" placeholder="https://compat.example.com">';
}

function ddns_compat_render_api_key_field(): void
{
    $value = esc_attr(get_option('ddns_compat_api_key', ''));
    echo '<input class="regular-text" type="password" name="ddns_compat_api_key" '
        . 'value="' . $value . '" autocomplete="off">';
    echo '<p class="description">Provided by the control plane for staging access.</p>';
}

function ddns_compat_render_site_id_field(): void
{
    $value = esc_attr(get_option('ddns_compat_site_id', ddns_compat_default_site_id()));
    echo '<input class="regular-text" type="text" name="ddns_compat_site_id" '
        . 'value="' . $value . '">';
}

function ddns_compat_render_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }

    $last_report = get_option('ddns_compat_last_report', '');
    $report_data = $last_report ? json_decode($last_report, true) : null;
    ?>
    <div class="wrap ddns-compat-admin">
        <h1>DDNS Compat Orchestrator</h1>

        <form method="post" action="options.php">
            <?php settings_fields('ddns_compat'); ?>
            <?php do_settings_sections('ddns-compat'); ?>
            <?php submit_button('Save settings'); ?>
        </form>

        <div class="ddns-compat-actions">
            <h2>Compatibility check</h2>
            <p>Connect staging and run the compatibility check to generate the report.</p>
            <button class="button" id="ddns-compat-connect">Connect staging</button>
            <button class="button button-primary" id="ddns-compat-run">Run compatibility check</button>
            <button class="button" id="ddns-compat-refresh">Refresh report</button>
            <div class="ddns-compat-status" id="ddns-compat-status" aria-live="polite"></div>
        </div>

        <div class="ddns-compat-report">
            <h2>Latest report</h2>
            <div id="ddns-compat-report">
                <?php if (is_array($report_data)) : ?>
                    <p><strong>Status:</strong> <?php echo esc_html($report_data['status'] ?? 'unknown'); ?></p>
                    <p><strong>Summary:</strong> <?php echo esc_html($report_data['summary'] ?? ''); ?></p>
                    <?php if (!empty($report_data['report_url'])) : ?>
                        <p><a href="<?php echo esc_url($report_data['report_url']); ?>" target="_blank" rel="noopener">View HTML report</a></p>
                    <?php endif; ?>
                    <?php if (!empty($report_data['changes'])) : ?>
                        <pre><?php echo esc_html(wp_json_encode($report_data['changes'], JSON_PRETTY_PRINT)); ?></pre>
                    <?php endif; ?>
                <?php else : ?>
                    <p>No report yet.</p>
                <?php endif; ?>
            </div>
        </div>

        <?php ddns_compat_render_wallet_section(); ?>
        <?php ddns_compat_render_miner_proof_section(); ?>
    </div>
    <?php
}

function ddns_compat_ajax_connect(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $payload = array(
        'site_url' => home_url(),
        'site_name' => get_bloginfo('name'),
        'site_id' => get_option('ddns_compat_site_id', ddns_compat_default_site_id()),
    );

    $response = ddns_compat_request('POST', '/v1/sites/connect', $payload);
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    if (!empty($response['data']['site_id'])) {
        update_option('ddns_compat_site_id', sanitize_text_field($response['data']['site_id']));
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_connect', 'ddns_compat_ajax_connect');

function ddns_compat_ajax_run_check(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $bundle = ddns_compat_export_bundle();
    $site_id = get_option('ddns_compat_site_id', ddns_compat_default_site_id());
    $response = ddns_compat_request('POST', '/v1/sites/' . rawurlencode($site_id) . '/bundles', array(
        'bundle' => $bundle,
    ));

    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    if (!empty($response['data']['job_id'])) {
        update_option('ddns_compat_last_job_id', sanitize_text_field($response['data']['job_id']));
    }

    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_run_check', 'ddns_compat_ajax_run_check');

function ddns_compat_ajax_fetch_report(): void
{
    check_ajax_referer('ddns_compat_admin', 'nonce');

    $job_id = isset($_POST['jobId']) ? sanitize_text_field(wp_unslash($_POST['jobId'])) : '';
    if ($job_id === '') {
        $job_id = get_option('ddns_compat_last_job_id', '');
    }

    if ($job_id === '') {
        wp_send_json_error(array('message' => 'No job ID yet.'), 400);
    }

    $response = ddns_compat_request('GET', '/v1/jobs/' . rawurlencode($job_id) . '/report');
    if (!$response['ok']) {
        wp_send_json_error($response, 500);
    }

    update_option('ddns_compat_last_report', wp_json_encode($response['data']));
    wp_send_json_success($response['data']);
}
add_action('wp_ajax_ddns_compat_fetch_report', 'ddns_compat_ajax_fetch_report');
if (!defined('ABSPATH')) exit;

function ddns_compat_register_settings(): void {
  register_setting('ddns_compat', 'ddns_compat_control_plane_url', array(
    'type' => 'string',
    'sanitize_callback' => 'esc_url_raw',
    'default' => ''
  ));
  register_setting('ddns_compat', 'ddns_compat_site_id', array(
    'type' => 'string',
    'sanitize_callback' => 'sanitize_text_field',
    'default' => ''
  ));
  register_setting('ddns_compat', 'ddns_compat_site_token', array(
    'type' => 'string',
    'sanitize_callback' => 'sanitize_text_field',
    'default' => ''
  ));

  add_options_page('DDNS Compat', 'DDNS Compat', 'manage_options', 'ddns-compat', 'ddns_compat_render_page');
}
add_action('admin_menu', 'ddns_compat_register_settings');

function ddns_compat_render_page(): void {
  if (!current_user_can('manage_options')) return;

  $url = esc_attr(get_option('ddns_compat_control_plane_url', ''));
  $site_id = esc_attr(get_option('ddns_compat_site_id', ''));
  $token = esc_attr(get_option('ddns_compat_site_token', ''));

  ?>
  <div class="wrap">
    <h1>DDNS Compat Orchestrator</h1>

    <h2>1) Control plane connection</h2>
    <form method="post" action="options.php">
      <?php settings_fields('ddns_compat'); ?>
      <table class="form-table" role="presentation">
        <tr>
          <th>Control Plane URL</th>
          <td>
            <input class="regular-text" type="url" name="ddns_compat_control_plane_url" value="<?php echo $url; ?>"
                   placeholder="https://api.yourdomain.tld" />
          </td>
        </tr>
        <tr>
          <th>Site ID</th>
          <td><input class="regular-text" type="text" name="ddns_compat_site_id" value="<?php echo $site_id; ?>" /></td>
        </tr>
        <tr>
          <th>Site Token</th>
          <td><input class="regular-text" type="text" name="ddns_compat_site_token" value="<?php echo $token; ?>" /></td>
        </tr>
      </table>
      <?php submit_button('Save'); ?>
    </form>

    <hr />

    <h2>2) Actions</h2>
    <p class="description">These actions run from wp-admin. No public WP endpoints are exposed.</p>

    <div class="ddns-actions">
      <button class="button button-primary" id="ddnsRegister">Register Site</button>
      <button class="button" id="ddnsRunCheck">Run Compatibility Check</button>
      <button class="button" id="ddnsPoll">Refresh Job Status</button>
    </div>

    <div id="ddnsStatus" class="ddns-box">Status: idle</div>
    <div id="ddnsReport" class="ddns-box ddns-report">Report will appear here.</div>

    <hr />
    <h2>3) Paid AI fix (placeholder)</h2>
    <p>Connect a wallet and pay to unlock AI-assisted repair jobs.</p>
    <button class="button" id="ddnsWallet">Connect Wallet</button>
    <button class="button" id="ddnsPay">Pay for AI Fix</button>

    <hr />
    <h2>4) Free access if hosting DDNS miner (placeholder)</h2>
    <p>Prove you are hosting the miner cache container to unlock free credits.</p>
    <button class="button" id="ddnsProveMiner">Prove Miner Running</button>
  </div>
  <?php
}

// Admin-only AJAX actions
add_action('wp_ajax_ddns_compat_register', 'ddns_compat_ajax_register');
add_action('wp_ajax_ddns_compat_run', 'ddns_compat_ajax_run');
add_action('wp_ajax_ddns_compat_poll', 'ddns_compat_ajax_poll');

function ddns_compat_ajax_register(): void {
  ddns_compat_require_admin_ajax();

  $cp = get_option('ddns_compat_control_plane_url', '');
  if (!$cp) ddns_compat_ajax_error('missing_control_plane_url');

  $site_id = get_option('ddns_compat_site_id', '');
  if (!$site_id) $site_id = 'wp_' . wp_generate_uuid4();

  $manifest = ddns_compat_build_manifest();
  $resp = ddns_compat_api_register_site($cp, $site_id, $manifest);

  if (!$resp['ok']) ddns_compat_ajax_error($resp['error'] ?? 'register_failed');

  // Save returned token
  update_option('ddns_compat_site_id', $resp['site']['site_id']);
  update_option('ddns_compat_site_token', $resp['site']['site_token']);

  wp_send_json(array('ok' => true, 'site' => $resp['site']));
}

function ddns_compat_ajax_run(): void {
  ddns_compat_require_admin_ajax();

  $cp = get_option('ddns_compat_control_plane_url', '');
  $site_id = get_option('ddns_compat_site_id', '');
  $token = get_option('ddns_compat_site_token', '');

  if (!$cp || !$site_id || !$token) ddns_compat_ajax_error('missing_site_registration');

  // Create bundle (zip)
  $bundle_path = ddns_compat_export_bundle();
  if (!$bundle_path) ddns_compat_ajax_error('bundle_export_failed');

  // Upload bundle
  $upload = ddns_compat_api_upload_bundle($cp, $site_id, $token, $bundle_path);
  if (!$upload['ok']) ddns_compat_ajax_error($upload['error'] ?? 'upload_failed');

  // Create job referencing upload_id
  $job = ddns_compat_api_create_job($cp, $site_id, $token, $upload['upload_id']);
  if (!$job['ok']) ddns_compat_ajax_error($job['error'] ?? 'job_create_failed');

  update_option('ddns_compat_last_job_id', $job['job']['id']);
  wp_send_json(array('ok' => true, 'job' => $job['job']));
}

function ddns_compat_ajax_poll(): void {
  ddns_compat_require_admin_ajax();

  $cp = get_option('ddns_compat_control_plane_url', '');
  $site_id = get_option('ddns_compat_site_id', '');
  $token = get_option('ddns_compat_site_token', '');
  $job_id = get_option('ddns_compat_last_job_id', '');

  if (!$cp || !$site_id || !$token || !$job_id) ddns_compat_ajax_error('missing_job');

  $job = ddns_compat_api_get_job($cp, $site_id, $token, $job_id);
  if (!$job['ok']) ddns_compat_ajax_error($job['error'] ?? 'job_fetch_failed');

  wp_send_json(array('ok' => true, 'job' => $job['job']));
}

function ddns_compat_require_admin_ajax(): void {
  if (!current_user_can('manage_options')) wp_send_json(array('ok' => false, 'error' => 'forbidden'), 403);
  $nonce = $_POST['nonce'] ?? '';
  if (!wp_verify_nonce($nonce, 'ddns_compat_nonce')) wp_send_json(array('ok' => false, 'error' => 'bad_nonce'), 400);
}

function ddns_compat_ajax_error($msg): void {
  wp_send_json(array('ok' => false, 'error' => $msg), 400);
}
