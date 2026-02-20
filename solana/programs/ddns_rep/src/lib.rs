use anchor_lang::prelude::*;

declare_id!("BS62AYwh5KuhTWoVHiDbpAhifK4SDC1FJtKaYw9bSKaE");

const SEED_CONFIG: &[u8] = b"rep_config";
const SEED_EPOCH_REP: &[u8] = b"rep_epoch";

#[program]
pub mod ddns_rep {
    use super::*;

    pub fn init_rep_config(
        ctx: Context<InitRepConfig>,
        epoch_len_slots: u64,
        base_points_per_entry: u64,
        high_conf_multiplier_bps: u16,
        med_conf_multiplier_bps: u16,
        low_conf_multiplier_bps: u16,
        daily_cap_points: u64,
        min_unique_subdomains: u32,
        min_unique_sources: u16,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.base_points_per_entry = base_points_per_entry;
        cfg.high_conf_multiplier_bps = high_conf_multiplier_bps;
        cfg.med_conf_multiplier_bps = med_conf_multiplier_bps;
        cfg.low_conf_multiplier_bps = low_conf_multiplier_bps;
        cfg.daily_cap_points = daily_cap_points;
        cfg.min_unique_subdomains = min_unique_subdomains;
        cfg.min_unique_sources = min_unique_sources;
        cfg.enabled = true;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_rep_enabled(ctx: Context<SetRepEnabled>, enabled: bool) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.authority, ctx.accounts.authority.key(), RepError::Unauthorized);
        ctx.accounts.config.enabled = enabled;
        Ok(())
    }

    pub fn award_rep(
        ctx: Context<AwardRep>,
        epoch_id: u64,
        contributor: Pubkey,
        accepted_entries: u32,
        unique_subdomains: u32,
        unique_sources: u16,
        confidence_level: u8, // 2 high, 1 medium, 0 low
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(cfg.enabled, RepError::Disabled);
        require_keys_eq!(cfg.authority, ctx.accounts.authority.key(), RepError::Unauthorized);
        require!(accepted_entries > 0, RepError::InvalidInput);

        let mut points = (accepted_entries as u128)
            .checked_mul(cfg.base_points_per_entry as u128)
            .ok_or_else(|| error!(RepError::MathOverflow))?;

        let multiplier = match confidence_level {
            2 => cfg.high_conf_multiplier_bps,
            1 => cfg.med_conf_multiplier_bps,
            _ => cfg.low_conf_multiplier_bps,
        } as u128;

        points = points
            .checked_mul(multiplier)
            .ok_or_else(|| error!(RepError::MathOverflow))?
            / 10_000u128;

        if unique_subdomains >= cfg.min_unique_subdomains {
            points = points
                .checked_mul(11)
                .ok_or_else(|| error!(RepError::MathOverflow))?
                / 10u128;
        }
        if unique_sources >= cfg.min_unique_sources {
            points = points
                .checked_mul(11)
                .ok_or_else(|| error!(RepError::MathOverflow))?
                / 10u128;
        }

        let stats = &mut ctx.accounts.epoch_rep;
        if stats.contributor == Pubkey::default() {
            stats.epoch_id = epoch_id;
            stats.contributor = contributor;
            stats.bump = ctx.bumps.epoch_rep;
        }
        require!(stats.epoch_id == epoch_id, RepError::EpochMismatch);
        require_keys_eq!(stats.contributor, contributor, RepError::ContributorMismatch);

        stats.accepted_entries = stats.accepted_entries.saturating_add(accepted_entries);
        stats.unique_subdomains = stats.unique_subdomains.max(unique_subdomains);
        stats.unique_sources = stats.unique_sources.max(unique_sources);

        let proposed = (stats.rep_points as u128)
            .checked_add(points)
            .ok_or_else(|| error!(RepError::MathOverflow))?;
        stats.rep_points = core::cmp::min(proposed as u64, cfg.daily_cap_points);
        stats.last_updated_slot = Clock::get()?.slot;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitRepConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RepConfig::SIZE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, RepConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetRepEnabled<'info> {
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, RepConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, contributor: Pubkey)]
pub struct AwardRep<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, RepConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + EpochRep::SIZE,
        seeds = [SEED_EPOCH_REP, epoch_id.to_le_bytes().as_ref(), contributor.as_ref()],
        bump
    )]
    pub epoch_rep: Account<'info, EpochRep>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct RepConfig {
    pub authority: Pubkey,
    pub epoch_len_slots: u64,
    pub base_points_per_entry: u64,
    pub high_conf_multiplier_bps: u16,
    pub med_conf_multiplier_bps: u16,
    pub low_conf_multiplier_bps: u16,
    pub daily_cap_points: u64,
    pub min_unique_subdomains: u32,
    pub min_unique_sources: u16,
    pub enabled: bool,
    pub bump: u8,
}

impl RepConfig {
    pub const SIZE: usize = 32 + 8 + 8 + 2 + 2 + 2 + 8 + 4 + 2 + 1 + 1;
}

#[account]
pub struct EpochRep {
    pub epoch_id: u64,
    pub contributor: Pubkey,
    pub accepted_entries: u32,
    pub unique_subdomains: u32,
    pub unique_sources: u16,
    pub rep_points: u64,
    pub last_updated_slot: u64,
    pub bump: u8,
}

impl EpochRep {
    pub const SIZE: usize = 8 + 32 + 4 + 4 + 2 + 8 + 8 + 1;
}

#[error_code]
pub enum RepError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("REP disabled")]
    Disabled,
    #[msg("Invalid input")]
    InvalidInput,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Epoch mismatch")]
    EpochMismatch,
    #[msg("Contributor mismatch")]
    ContributorMismatch,
}
