<?php
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
