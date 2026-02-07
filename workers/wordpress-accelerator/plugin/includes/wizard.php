<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_require_admin(): void
{
    if (!current_user_can('manage_options')) {
        wp_send_json_error(array('message' => 'Unauthorized.'), 403);
    }
}

function ddns_accelerator_register_menu(): void
{
    add_menu_page(
        'DDNS Accelerator',
        'DDNS Accelerator',
        'manage_options',
        'ddns-accelerator',
        'ddns_accelerator_render_wizard_page',
        'dashicons-cloud'
    );
}
add_action('admin_menu', 'ddns_accelerator_register_menu');

function ddns_accelerator_render_wizard_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }

    $zones = array();
    $selected_zone_id = (string) get_option('ddns_accelerator_cf_zone_id', '');
    $selected_zone_name = (string) get_option('ddns_accelerator_cf_zone_name', '');
    if ($selected_zone_id && $selected_zone_name) {
        $zones[] = array('id' => $selected_zone_id, 'name' => $selected_zone_name);
    }

    $targets = ddns_accelerator_snapshot_targets();
    $selected_dirs = get_option('ddns_accelerator_snapshot_dirs', array('uploads'));
    if (!is_array($selected_dirs)) {
        $selected_dirs = array('uploads');
    }

    $last_snapshot = get_option('ddns_accelerator_last_snapshot', '');
    $last_error = get_option('ddns_accelerator_last_snapshot_error', '');
    ?>
    <div class="wrap ddns-accelerator">
        <h1>DDNS Accelerator Wizard</h1>
        <p class="description">
            Move as much as possible to the edge: caching, routing, security,
            asset optimization, backup triggers, and automation.
        </p>

        <?php settings_errors('ddns_accelerator'); ?>

        <form method="post" action="options.php" id="ddns-accelerator-settings">
            <?php settings_fields('ddns_accelerator'); ?>

            <div class="ddns-accelerator-step">
                <h2>Step 1: Connect GitHub + Cloudflare</h2>
                <p>
                    Link this WordPress site to a GitHub repo for file backups and
                    automation. The GitHub PAT connects the site to your repo so
                    GitHub Actions can react to changes, while the Cloudflare API
                    token powers worker provisioning and cache purges.
                </p>
                <table class="form-table">
                    <tr>
                        <th><label for="ddns-accelerator-worker-endpoint">Worker endpoint URL</label></th>
                        <td>
                            <input
                                class="regular-text"
                                id="ddns-accelerator-worker-endpoint"
                                type="url"
                                name="ddns_accelerator_worker_endpoint"
                                value="<?php echo esc_attr(get_option('ddns_accelerator_worker_endpoint', '')); ?>"
                                placeholder="https://control.example.com/v1/control/install-worker"
                            />
                            <p class="description">
                                The control-plane endpoint that provisions caching
                                workers (or leave blank to validate only).
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="ddns-accelerator-github-owner">GitHub org/user</label></th>
                        <td>
                            <input
                                class="regular-text"
                                id="ddns-accelerator-github-owner"
                                type="text"
                                name="ddns_accelerator_github_owner"
                                value="<?php echo esc_attr(get_option('ddns_accelerator_github_owner', '')); ?>"
                                placeholder="your-org"
                                required
                            />
                        </td>
                    </tr>
                    <tr>
                        <th><label for="ddns-accelerator-github-repo">GitHub repo</label></th>
                        <td>
                            <input
                                class="regular-text"
                                id="ddns-accelerator-github-repo"
                                type="text"
                                name="ddns_accelerator_github_repo"
                                value="<?php echo esc_attr(get_option('ddns_accelerator_github_repo', '')); ?>"
                                placeholder="site-backups"
                                required
                            />
                        </td>
                    </tr>
                    <tr>
                        <th><label for="ddns-accelerator-github-pat">GitHub PAT</label></th>
                        <td>
                            <input
                                class="regular-text ddns-accelerator-secret"
                                id="ddns-accelerator-github-pat"
                                type="password"
                                name="ddns_accelerator_github_pat"
                                value="<?php echo esc_attr(get_option('ddns_accelerator_github_pat', '')); ?>"
                                placeholder="ghp_***"
                                required
                            />
                            <p class="description">Fine-grained PAT with repo contents write access.</p>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="ddns-accelerator-cf-token">Cloudflare API token</label></th>
                        <td>
                            <input
                                class="regular-text ddns-accelerator-secret"
                                id="ddns-accelerator-cf-token"
                                type="password"
                                name="ddns_accelerator_cf_api_token"
                                value="<?php echo esc_attr(get_option('ddns_accelerator_cf_api_token', '')); ?>"
                                placeholder="cf_***"
                                required
                            />
                            <p class="description">Token must allow zone read, cache purge, and Workers routes.</p>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="ddns-accelerator-step">
                <h2>Step 2: Select your Cloudflare zone</h2>
                <p>Load your zones and pick the one that matches this site.</p>
                <div class="ddns-accelerator-zone-row">
                    <select name="ddns_accelerator_cf_zone_id" id="ddns-accelerator-zone-id">
                        <option value="">Select a zone</option>
                        <?php foreach ($zones as $zone) : ?>
                            <option value="<?php echo esc_attr($zone['id']); ?>" <?php selected($zone['id'], $selected_zone_id); ?>>
                                <?php echo esc_html($zone['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <button type="button" class="button" id="ddns-accelerator-fetch-zones">Fetch zones</button>
                    <span class="ddns-accelerator-status" id="ddns-accelerator-zone-status"></span>
                </div>
                <input type="hidden" name="ddns_accelerator_cf_zone_name" id="ddns-accelerator-zone-name" value="<?php echo esc_attr($selected_zone_name); ?>" />
            </div>

            <div class="ddns-accelerator-step">
                <h2>Step 3: Choose what to sync</h2>
                <p>
                    Changes are pushed directly to GitHub (no zip files). Select
                    the directories you want mirrored.
                </p>
                <div class="ddns-accelerator-checkboxes">
                    <?php foreach ($targets as $key => $target) : ?>
                        <label>
                            <input
                                type="checkbox"
                                name="ddns_accelerator_snapshot_dirs[]"
                                value="<?php echo esc_attr($key); ?>"
                                <?php checked(in_array($key, $selected_dirs, true)); ?>
                            />
                            <?php echo esc_html($target['label']); ?>
                        </label>
                    <?php endforeach; ?>
                </div>
                <label class="ddns-accelerator-toggle">
                    <input type="checkbox" name="ddns_accelerator_auto_sync" value="1" <?php checked(get_option('ddns_accelerator_auto_sync', 0)); ?> />
                    Auto-sync on updates (runs within 1 minute of changes)
                </label>
            </div>

            <div class="ddns-accelerator-step">
                <h2>Step 4: Install caching worker</h2>
                <p>
                    Provision the caching worker using your control-plane. This
                    links the site, zone, and GitHub repo for automation.
                </p>
                <button type="button" class="button button-primary" id="ddns-accelerator-install-worker">Install caching worker</button>
                <span class="ddns-accelerator-status" id="ddns-accelerator-install-status"></span>
            </div>

            <div class="ddns-accelerator-step">
                <h2>Step 5: Run snapshot</h2>
                <p>
                    Push current files to GitHub and purge Cloudflare caches for
                    changed assets. Last run: <?php echo $last_snapshot ? esc_html($last_snapshot) : 'Never'; ?>.
                </p>
                <?php if (!empty($last_error)) : ?>
                    <p class="ddns-accelerator-error">Last error: <?php echo esc_html($last_error); ?></p>
                <?php endif; ?>
                <button type="button" class="button" id="ddns-accelerator-run-snapshot">Run snapshot now</button>
                <span class="ddns-accelerator-status" id="ddns-accelerator-snapshot-status"></span>
            </div>

            <?php submit_button('Save settings'); ?>
        </form>
    </div>
    <?php
}

function ddns_accelerator_ajax_list_zones(): void
{
    ddns_accelerator_require_admin();
    check_ajax_referer('ddns-accelerator', 'nonce');

    $token = sanitize_text_field($_POST['token'] ?? '');
    if ($token === '') {
        $token = (string) get_option('ddns_accelerator_cf_api_token', '');
    }

    if ($token === '') {
        wp_send_json_error(array('message' => 'Cloudflare API token is required.'), 400);
    }

    try {
        $zones = ddns_accelerator_cf_list_zones($token);
    } catch (RuntimeException $e) {
        wp_send_json_error(array('message' => $e->getMessage()), 400);
    }

    wp_send_json_success(array('zones' => $zones));
}
add_action('wp_ajax_ddns_accelerator_list_zones', 'ddns_accelerator_ajax_list_zones');

function ddns_accelerator_ajax_install_worker(): void
{
    ddns_accelerator_require_admin();
    check_ajax_referer('ddns-accelerator', 'nonce');

    $endpoint = trim((string) get_option('ddns_accelerator_worker_endpoint', ''));
    $zone_id = trim((string) get_option('ddns_accelerator_cf_zone_id', ''));
    $zone_name = trim((string) get_option('ddns_accelerator_cf_zone_name', ''));
    $token = trim((string) get_option('ddns_accelerator_cf_api_token', ''));
    $owner = trim((string) get_option('ddns_accelerator_github_owner', ''));
    $repo = trim((string) get_option('ddns_accelerator_github_repo', ''));
    $pat = trim((string) get_option('ddns_accelerator_github_pat', ''));

    if ($owner === '' || $repo === '' || $pat === '' || $token === '') {
        wp_send_json_error(array('message' => 'GitHub + Cloudflare credentials are required.'), 400);
    }

    if ($zone_id === '') {
        wp_send_json_error(array('message' => 'Select a Cloudflare zone first.'), 400);
    }

    if ($endpoint === '') {
        wp_send_json_success(array('message' => 'Control-plane endpoint not set. Credentials validated only.'));
        return;
    }

    $payload = array(
        'site_url' => site_url(),
        'zone_id' => $zone_id,
        'zone_name' => $zone_name,
        'github_owner' => $owner,
        'github_repo' => $repo,
        'github_pat' => $pat,
        'cloudflare_token' => $token,
    );

    try {
        $response = ddns_accelerator_api_json($endpoint, $payload);
    } catch (RuntimeException $e) {
        wp_send_json_error(array('message' => $e->getMessage()), 400);
    }

    if (empty($response['ok'])) {
        $message = !empty($response['error']) ? $response['error'] : 'Control-plane request failed.';
        wp_send_json_error(array('message' => $message), 400);
    }

    wp_send_json_success(array('message' => 'Worker install request sent.'));
}
add_action('wp_ajax_ddns_accelerator_install_worker', 'ddns_accelerator_ajax_install_worker');

function ddns_accelerator_ajax_run_snapshot(): void
{
    ddns_accelerator_require_admin();
    check_ajax_referer('ddns-accelerator', 'nonce');

    try {
        $result = ddns_accelerator_run_snapshot(true);
    } catch (RuntimeException $e) {
        wp_send_json_error(array('message' => $e->getMessage()), 400);
    }

    wp_send_json_success(array('message' => sprintf('Synced %d of %d files.', $result['uploaded'], $result['changed'])));
}
add_action('wp_ajax_ddns_accelerator_run_snapshot', 'ddns_accelerator_ajax_run_snapshot');
