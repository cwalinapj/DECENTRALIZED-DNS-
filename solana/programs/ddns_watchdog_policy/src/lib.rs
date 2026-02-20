use anchor_lang::prelude::*;

declare_id!("Ct4gQ98PofJxca2HSQrfzd1Cohay4praM9dFF2L9jr1g");

const MAX_WATCHDOGS: usize = 64;
const MAX_SUBMITTERS: usize = 16;

const SEED_CONFIG: &[u8] = b"policy_config";
const SEED_WATCHDOG: &[u8] = b"watchdog";
const SEED_NAME_POLICY: &[u8] = b"name_policy";
const SEED_ATTEST_LOG: &[u8] = b"attest_log";
const SEED_ATTEST_MARK: &[u8] = b"attest_mark";

#[program]
pub mod ddns_watchdog_policy {
    use super::*;

    pub fn init_policy_config(ctx: Context<InitPolicyConfig>, params: PolicyParams) -> Result<()> {
        require!(params.epoch_len_slots > 0, WatchdogError::InvalidConfig);
        require!(params.min_watchdogs > 0, WatchdogError::InvalidConfig);
        require!(
            params.warn_threshold_bps <= 10_000 && params.quarantine_threshold_bps <= 10_000,
            WatchdogError::InvalidConfig
        );
        require!(
            params.warn_threshold_bps <= params.quarantine_threshold_bps,
            WatchdogError::InvalidConfig
        );
        require!(
            params.allowlisted_watchdogs.len() <= MAX_WATCHDOGS
                && params.allowlisted_submitters.len() <= MAX_SUBMITTERS,
            WatchdogError::AllowlistTooLarge
        );

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.epoch_len_slots = params.epoch_len_slots;
        cfg.attestation_max_age_secs = params.attestation_max_age_secs;
        cfg.min_watchdogs = params.min_watchdogs;
        cfg.warn_threshold_bps = params.warn_threshold_bps;
        cfg.quarantine_threshold_bps = params.quarantine_threshold_bps;
        cfg.allowlisted_watchdogs = params.allowlisted_watchdogs;
        cfg.allowlisted_submitters = params.allowlisted_submitters;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_watchdog_enabled(
        ctx: Context<SetWatchdogEnabled>,
        watchdog: Pubkey,
        enabled: bool,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, WatchdogError::Unauthorized);
        require!(
            is_allowlisted(&cfg.allowlisted_watchdogs, &watchdog),
            WatchdogError::WatchdogNotAllowlisted
        );

        let ws = &mut ctx.accounts.watchdog_state;
        ws.watchdog = watchdog;
        ws.enabled = enabled;
        ws.last_seen_unix = Clock::get()?.unix_timestamp;
        // MVP: reputation is not automated.
        if ws.reputation_score == 0 {
            ws.reputation_score = 0;
        }
        ws.bump = ctx.bumps.watchdog_state;
        Ok(())
    }

    pub fn update_thresholds(ctx: Context<UpdateThresholds>, warn_bps: u16, quarantine_bps: u16) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, WatchdogError::Unauthorized);
        require!(warn_bps <= 10_000 && quarantine_bps <= 10_000, WatchdogError::InvalidConfig);
        require!(warn_bps <= quarantine_bps, WatchdogError::InvalidConfig);
        cfg.warn_threshold_bps = warn_bps;
        cfg.quarantine_threshold_bps = quarantine_bps;
        Ok(())
    }

    pub fn set_allowlists(
        ctx: Context<SetAllowlists>,
        allowlisted_watchdogs: Vec<Pubkey>,
        allowlisted_submitters: Vec<Pubkey>,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.authority.key(), cfg.authority, WatchdogError::Unauthorized);
        require!(
            allowlisted_watchdogs.len() <= MAX_WATCHDOGS
                && allowlisted_submitters.len() <= MAX_SUBMITTERS,
            WatchdogError::AllowlistTooLarge
        );
        cfg.allowlisted_watchdogs = allowlisted_watchdogs;
        cfg.allowlisted_submitters = allowlisted_submitters;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn submit_attestation_digest(
        ctx: Context<SubmitAttestationDigest>,
        epoch_id: u64,
        name_hash: [u8; 32],
        kind: u8,
        outcome: u8,
        reason_flags: u32,
        confidence_bps: u16,
        rrset_hash: [u8; 32],
        observed_at_unix: i64,
        last_root: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let submitter = ctx.accounts.submitter.key();
        let watchdog = ctx.accounts.watchdog.key();

        require!(
            is_allowlisted(&cfg.allowlisted_watchdogs, &watchdog),
            WatchdogError::WatchdogNotAllowlisted
        );

        // MVP: either watchdog self-submits, or an allowlisted submitter submits on behalf.
        let submitter_ok = submitter == watchdog
            || is_allowlisted(&cfg.allowlisted_submitters, &submitter);
        require!(submitter_ok, WatchdogError::Unauthorized);

        let now = Clock::get()?.unix_timestamp;
        let max_age = cfg.attestation_max_age_secs as i64;
        if max_age > 0 {
            require!(observed_at_unix >= now.saturating_sub(max_age), WatchdogError::AttestationTooOld);
        }
        require!(observed_at_unix <= now.saturating_add(120), WatchdogError::AttestationFromFuture);

        require!(confidence_bps <= 10_000, WatchdogError::InvalidConfidence);

        let current_epoch = current_epoch(cfg)?;
        require!(epoch_id == current_epoch, WatchdogError::EpochMismatch);

        // Ensure watchdog state is enabled (auto-init if missing).
        let ws = &mut ctx.accounts.watchdog_state;
        if ws.watchdog == Pubkey::default() {
            ws.watchdog = watchdog;
            ws.enabled = true;
            ws.reputation_score = 0;
            ws.bump = ctx.bumps.watchdog_state;
        }
        require!(ws.enabled, WatchdogError::WatchdogDisabled);
        ws.last_seen_unix = now;

        // Initialize policy state if needed.
        let ps = &mut ctx.accounts.name_policy_state;
        if ps.name_hash == [0u8; 32] {
            ps.name_hash = name_hash;
            ps.status = PolicyStatus::Ok as u8;
            ps.confidence_bps = 0;
            ps.reason_flags = 0;
            ps.last_updated_unix = 0;
            ps.last_epoch_id = current_epoch;
            ps.rolling_ok = 0;
            ps.rolling_fail = 0;
            ps.rolling_mismatch = 0;
            ps.distinct_watchdogs_last_epoch = 0;
            ps.penalty_bps = 0;
            ps.recommended_ttl_cap = 0;
            ps.bump = ctx.bumps.name_policy_state;
        }

        // Reset rolling counters when epoch changes.
        if ps.last_epoch_id != current_epoch {
            ps.rolling_ok = 0;
            ps.rolling_fail = 0;
            ps.rolling_mismatch = 0;
            ps.distinct_watchdogs_last_epoch = 0;
            ps.reason_flags = 0;
            ps.last_epoch_id = current_epoch;
        }

        // Init attestation log (epoch + name).
        let al = &mut ctx.accounts.attest_log;
        if al.epoch_id == 0 {
            al.epoch_id = current_epoch;
            al.name_hash = name_hash;
            al.count = 0;
            al.ok = 0;
            al.fail = 0;
            al.mismatch = 0;
            al.distinct_watchdogs = 0;
            al.last_root = [0u8; 32];
            al.bump = ctx.bumps.attest_log;
        }

        // Mark distinct watchdog for this (epoch,name). If newly initialized, increment distinct counts.
        let mark = &mut ctx.accounts.attest_mark;
        let mark_new = mark.epoch_id == 0;
        if mark_new {
            mark.epoch_id = current_epoch;
            mark.name_hash = name_hash;
            mark.watchdog = watchdog;
            mark.first_seen_unix = now;
            mark.bump = ctx.bumps.attest_mark;
            al.distinct_watchdogs = al.distinct_watchdogs.saturating_add(1);
            ps.distinct_watchdogs_last_epoch = ps.distinct_watchdogs_last_epoch.saturating_add(1);
        }

        // Update rolling counters.
        let is_mismatch = kind == 2;
        let is_ok = kind == 1 && outcome == 0;

        al.count = al.count.saturating_add(1);
        if is_mismatch {
            al.mismatch = al.mismatch.saturating_add(1);
            ps.rolling_mismatch = ps.rolling_mismatch.saturating_add(1);
        } else if is_ok {
            al.ok = al.ok.saturating_add(1);
            ps.rolling_ok = ps.rolling_ok.saturating_add(1);
        } else {
            al.fail = al.fail.saturating_add(1);
            ps.rolling_fail = ps.rolling_fail.saturating_add(1);
        }

        al.last_root = last_root;

        // Update name policy state.
        ps.reason_flags |= reason_flags;
        ps.last_updated_unix = now;

        // Risk and state transitions.
        let distinct = ps.distinct_watchdogs_last_epoch;
        if distinct >= cfg.min_watchdogs {
            let ok_w = ps.rolling_ok as u64;
            let fail_w = (ps.rolling_fail as u64).saturating_mul(2);
            let mismatch_w = (ps.rolling_mismatch as u64).saturating_mul(3);
            let denom = ok_w.saturating_add(fail_w).saturating_add(mismatch_w);
            if denom > 0 {
                let risk_num = fail_w.saturating_add(mismatch_w).saturating_mul(10_000);
                let risk_bps = (risk_num / denom) as u16;
                if risk_bps >= cfg.quarantine_threshold_bps {
                    ps.status = PolicyStatus::Quarantine as u8;
                } else if risk_bps >= cfg.warn_threshold_bps {
                    ps.status = PolicyStatus::Warn as u8;
                } else {
                    ps.status = PolicyStatus::Ok as u8;
                }
            }
        }

        // Confidence grows with the number of observations (MVP heuristic).
        let total = (ps.rolling_ok as u32)
            .saturating_add(ps.rolling_fail as u32)
            .saturating_add(ps.rolling_mismatch as u32);
        let conf = (total as u64).saturating_mul(500);
        ps.confidence_bps = conf.min(10_000) as u16;

        // Output policy fields for consumers.
        match PolicyStatus::from_u8(ps.status) {
            PolicyStatus::Ok => {
                ps.penalty_bps = 0;
                ps.recommended_ttl_cap = 0;
            }
            PolicyStatus::Warn => {
                ps.penalty_bps = 500;
                ps.recommended_ttl_cap = if ps.recommended_ttl_cap == 0 {
                    300
                } else {
                    ps.recommended_ttl_cap.min(300)
                };
            }
            PolicyStatus::Quarantine => {
                ps.penalty_bps = 2500;
                ps.recommended_ttl_cap = 60;
            }
        }

        emit!(AttestationDigestAccepted {
            epoch_id: current_epoch,
            name_hash,
            kind,
            outcome,
            watchdog,
            rrset_hash,
            observed_at_unix,
            reason_flags,
            confidence_bps,
            status: ps.status,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitPolicyConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PolicyConfig::SIZE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, PolicyConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetWatchdogEnabled<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, PolicyConfig>,

    /// CHECK: watchdog identity (does not need to sign for admin enable/disable).
    pub watchdog: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + WatchdogState::SIZE,
        seeds = [SEED_WATCHDOG, watchdog.key().as_ref()],
        bump
    )]
    pub watchdog_state: Account<'info, WatchdogState>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateThresholds<'info> {
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, PolicyConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetAllowlists<'info> {
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, PolicyConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, name_hash: [u8; 32])]
pub struct SubmitAttestationDigest<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, PolicyConfig>,

    /// CHECK: watchdog identity.
    pub watchdog: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = submitter,
        space = 8 + WatchdogState::SIZE,
        seeds = [SEED_WATCHDOG, watchdog.key().as_ref()],
        bump
    )]
    pub watchdog_state: Account<'info, WatchdogState>,

    #[account(
        init_if_needed,
        payer = submitter,
        space = 8 + NamePolicyState::SIZE,
        seeds = [SEED_NAME_POLICY, name_hash.as_ref()],
        bump
    )]
    pub name_policy_state: Account<'info, NamePolicyState>,

    #[account(
        init_if_needed,
        payer = submitter,
        space = 8 + AttestationLog::SIZE,
        seeds = [SEED_ATTEST_LOG, epoch_id.to_le_bytes().as_ref(), name_hash.as_ref()],
        bump
    )]
    pub attest_log: Account<'info, AttestationLog>,

    #[account(
        init_if_needed,
        payer = submitter,
        space = 8 + AttestationMark::SIZE,
        seeds = [
            SEED_ATTEST_MARK,
            epoch_id.to_le_bytes().as_ref(),
            name_hash.as_ref(),
            watchdog.key().as_ref()
        ],
        bump
    )]
    pub attest_mark: Account<'info, AttestationMark>,

    #[account(mut)]
    pub submitter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PolicyConfig {
    pub authority: Pubkey,
    pub epoch_len_slots: u64,
    pub attestation_max_age_secs: u32,
    pub min_watchdogs: u16,
    pub warn_threshold_bps: u16,
    pub quarantine_threshold_bps: u16,
    pub allowlisted_watchdogs: Vec<Pubkey>,
    pub allowlisted_submitters: Vec<Pubkey>,
    pub bump: u8,
}

impl PolicyConfig {
    pub const SIZE: usize =
        32  // authority
        + 8   // epoch_len_slots
        + 4   // attestation_max_age_secs
        + 2   // min_watchdogs
        + 2   // warn_threshold_bps
        + 2   // quarantine_threshold_bps
        + 4 + 32 * MAX_WATCHDOGS // allowlisted_watchdogs vec
        + 4 + 32 * MAX_SUBMITTERS // allowlisted_submitters vec
        + 1; // bump
}

#[account]
pub struct WatchdogState {
    pub watchdog: Pubkey,
    pub enabled: bool,
    pub reputation_score: i64,
    pub last_seen_unix: i64,
    pub bump: u8,
}

impl WatchdogState {
    pub const SIZE: usize = 32 + 1 + 8 + 8 + 1;
}

#[account]
pub struct NamePolicyState {
    pub name_hash: [u8; 32],
    pub status: u8, // 0 ok, 1 warn, 2 quarantine
    pub confidence_bps: u16,
    pub reason_flags: u32,
    pub last_updated_unix: i64,
    pub last_epoch_id: u64,
    pub rolling_ok: u32,
    pub rolling_fail: u32,
    pub rolling_mismatch: u32,
    pub distinct_watchdogs_last_epoch: u16,
    pub penalty_bps: u16,
    pub recommended_ttl_cap: u32,
    pub bump: u8,
}

impl NamePolicyState {
    pub const SIZE: usize = 32 + 1 + 2 + 4 + 8 + 8 + 4 * 3 + 2 + 2 + 4 + 1;
}

#[account]
pub struct AttestationLog {
    pub epoch_id: u64,
    pub name_hash: [u8; 32],
    pub count: u16,
    pub ok: u16,
    pub fail: u16,
    pub mismatch: u16,
    pub distinct_watchdogs: u16,
    pub last_root: [u8; 32],
    pub bump: u8,
}

impl AttestationLog {
    pub const SIZE: usize = 8 + 32 + 2 * 5 + 32 + 1;
}

#[account]
pub struct AttestationMark {
    pub epoch_id: u64,
    pub name_hash: [u8; 32],
    pub watchdog: Pubkey,
    pub first_seen_unix: i64,
    pub bump: u8,
}

impl AttestationMark {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PolicyParams {
    pub epoch_len_slots: u64,
    pub attestation_max_age_secs: u32,
    pub min_watchdogs: u16,
    pub warn_threshold_bps: u16,
    pub quarantine_threshold_bps: u16,
    pub allowlisted_watchdogs: Vec<Pubkey>,
    pub allowlisted_submitters: Vec<Pubkey>,
}

#[event]
pub struct AttestationDigestAccepted {
    pub epoch_id: u64,
    pub name_hash: [u8; 32],
    pub kind: u8,
    pub outcome: u8,
    pub watchdog: Pubkey,
    pub rrset_hash: [u8; 32],
    pub observed_at_unix: i64,
    pub reason_flags: u32,
    pub confidence_bps: u16,
    pub status: u8,
}

#[repr(u8)]
pub enum PolicyStatus {
    Ok = 0,
    Warn = 1,
    Quarantine = 2,
}

impl PolicyStatus {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => PolicyStatus::Warn,
            2 => PolicyStatus::Quarantine,
            _ => PolicyStatus::Ok,
        }
    }
}

fn is_allowlisted(list: &[Pubkey], k: &Pubkey) -> bool {
    list.iter().any(|x| x == k)
}

fn current_epoch(cfg: &PolicyConfig) -> Result<u64> {
    let slot = Clock::get()?.slot;
    Ok(slot / cfg.epoch_len_slots)
}

#[error_code]
pub enum WatchdogError {
    #[msg("unauthorized")]
    Unauthorized,
    #[msg("invalid config")]
    InvalidConfig,
    #[msg("allowlist too large")]
    AllowlistTooLarge,
    #[msg("watchdog not allowlisted")]
    WatchdogNotAllowlisted,
    #[msg("watchdog disabled")]
    WatchdogDisabled,
    #[msg("attestation too old")]
    AttestationTooOld,
    #[msg("attestation from future")]
    AttestationFromFuture,
    #[msg("epoch mismatch")]
    EpochMismatch,
    #[msg("invalid confidence")]
    InvalidConfidence,
}

