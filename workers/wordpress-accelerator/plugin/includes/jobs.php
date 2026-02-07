<?php

if (!defined('ABSPATH')) {
    exit;
}

function ddns_accelerator_queue_snapshot(): void
{
    if (!get_option('ddns_accelerator_auto_sync', 0)) {
        return;
    }

    if (wp_next_scheduled('ddns_accelerator_snapshot_job')) {
        return;
    }

    wp_schedule_single_event(time() + 60, 'ddns_accelerator_snapshot_job');
}

function ddns_accelerator_snapshot_job(): void
{
    try {
        ddns_accelerator_run_snapshot();
    } catch (RuntimeException $e) {
        update_option('ddns_accelerator_last_snapshot_error', $e->getMessage(), false);
    }
}
add_action('ddns_accelerator_snapshot_job', 'ddns_accelerator_snapshot_job');

add_action('save_post', 'ddns_accelerator_queue_snapshot');
add_action('add_attachment', 'ddns_accelerator_queue_snapshot');
add_action('delete_attachment', 'ddns_accelerator_queue_snapshot');
add_action('upgrader_process_complete', 'ddns_accelerator_queue_snapshot');
add_action('switch_theme', 'ddns_accelerator_queue_snapshot');
