use anchor_lang::prelude::*;

declare_id!("D58DJ6VopJKZCJ2cppAJZUcHE1UFF1qruPiU3EP3WMqM");

#[program]
pub mod ddns_registry {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        epoch_len_slots: u64,
        min_receipts: u32,
        min_stake_weight: u64,
        ttl_min_s: u32,
        ttl_max_s: u32,
        finalize_authority: Pubkey,
    ) -> Result<()> {
        require!(ttl_min_s <= ttl_max_s, RegistryError::BadTtlCaps);

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.min_receipts = min_receipts;
        cfg.min_stake_weight = min_stake_weight;
        cfg.ttl_min_s = ttl_min_s;
        cfg.ttl_max_s = ttl_max_s;
        cfg.finalize_authority = finalize_authority;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        epoch_len_slots: u64,
        min_receipts: u32,
        min_stake_weight: u64,
        ttl_min_s: u32,
        ttl_max_s: u32,
        finalize_authority: Pubkey,
    ) -> Result<()> {
        require!(ttl_min_s <= ttl_max_s, RegistryError::BadTtlCaps);

        let cfg = &mut ctx.accounts.config;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.min_receipts = min_receipts;
        cfg.min_stake_weight = min_stake_weight;
        cfg.ttl_min_s = ttl_min_s;
        cfg.ttl_max_s = ttl_max_s;
        cfg.finalize_authority = finalize_authority;
        Ok(())
    }

    // Called by ddns_quorum via CPI (authorized by config.finalize_authority signer).
    pub fn finalize_route(
        ctx: Context<FinalizeRoute>,
        name_hash: [u8; 32],
        dest_hash: [u8; 32],
        ttl_s: u32,
        aggregate_ref: Pubkey,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require_keys_eq!(
            ctx.accounts.finalize_authority.key(),
            cfg.finalize_authority,
            RegistryError::UnauthorizedFinalize
        );

        require!(
            ttl_s >= cfg.ttl_min_s && ttl_s <= cfg.ttl_max_s,
            RegistryError::TtlOutOfRange
        );

        let slot = Clock::get()?.slot;
        let route = &mut ctx.accounts.canonical_route;

        let is_new = route.version == 0;
        if is_new {
            route.name_hash = name_hash;
            route.dest_hash = dest_hash;
            route.ttl_s = ttl_s;
            route.version = 1;
            route.updated_at_slot = slot;
            route.last_aggregate = aggregate_ref;
            route.bump = ctx.bumps.canonical_route;
            return Ok(());
        }

        if route.dest_hash != dest_hash || route.ttl_s != ttl_s {
            route.version = route.version.checked_add(1).ok_or(RegistryError::Overflow)?;
            route.dest_hash = dest_hash;
            route.ttl_s = ttl_s;
        }

        route.updated_at_slot = slot;
        route.last_aggregate = aggregate_ref;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::SIZE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8;32])]
pub struct FinalizeRoute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Must match config.finalize_authority. In MVP, this is a ddns_quorum PDA signer.
    pub finalize_authority: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + CanonicalRoute::SIZE,
        seeds = [b"canonical", name_hash.as_ref()],
        bump
    )]
    pub canonical_route: Account<'info, CanonicalRoute>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub finalize_authority: Pubkey,
    pub epoch_len_slots: u64,
    pub min_receipts: u32,
    pub min_stake_weight: u64,
    pub ttl_min_s: u32,
    pub ttl_max_s: u32,
    pub bump: u8,
}

impl Config {
    pub const SIZE: usize = 32 + 32 + 8 + 4 + 8 + 4 + 4 + 1;
}

#[account]
pub struct CanonicalRoute {
    pub name_hash: [u8; 32],
    pub dest_hash: [u8; 32],
    pub ttl_s: u32,
    pub version: u64,
    pub updated_at_slot: u64,
    pub last_aggregate: Pubkey,
    pub bump: u8,
}

impl CanonicalRoute {
    pub const SIZE: usize = 32 + 32 + 4 + 8 + 8 + 32 + 1;
}

#[error_code]
pub enum RegistryError {
    #[msg("Unauthorized finalize authority.")]
    UnauthorizedFinalize,
    #[msg("TTL caps are invalid.")]
    BadTtlCaps,
    #[msg("TTL is out of range.")]
    TtlOutOfRange,
    #[msg("Arithmetic overflow.")]
    Overflow,
}
