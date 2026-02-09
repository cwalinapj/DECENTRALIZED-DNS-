use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, program_pack::Pack, system_instruction};
use anchor_spl::token::{self, Token, Transfer};

declare_id!("86XQF9V51Z8L8MLUP7yMU6ZWPzfaK1nhFsr3Hd8mYFgt");

const BPS_DENOM: u64 = 10_000;

const MAX_ALLOWLIST: usize = 16;
const MAX_LOCK_TIERS: usize = 6;
const MAX_VERIFIERS: usize = 64;

const SEED_CONFIG: &[u8] = b"stake_gov_config";
const SEED_VAULT_AUTH: &[u8] = b"stake_gov_vault_authority";
const SEED_VERIFIER_REGISTRY: &[u8] = b"verifier_registry";
const SEED_STAKE: &[u8] = b"stake";
const SEED_SNAPSHOT: &[u8] = b"stake_snapshot";
const SEED_SLASH: &[u8] = b"slash";

#[program]
pub mod ddns_stake_gov {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn init_config(
        ctx: Context<InitConfig>,
        stake_mint: Pubkey,
        epoch_len_slots: u64,
        min_stake: u64,
        max_verifiers: u32,
        dispute_window_epochs: u64,
        exit_cooldown_epochs: u64,
        min_lock_epochs: u64,
        max_lock_epochs: u64,
        jail_epochs_after_slash: u64,
        max_slash_bps_per_event: u16,
        lock_tiers: [LockTier; MAX_LOCK_TIERS],
        slash_authorities: Vec<Pubkey>,
        snapshot_submitters: Vec<Pubkey>,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, StakeGovError::InvalidConfig);
        require!(
            max_verifiers as usize <= MAX_VERIFIERS,
            StakeGovError::InvalidConfig
        );
        require!(
            min_lock_epochs <= max_lock_epochs,
            StakeGovError::InvalidConfig
        );
        require!(
            max_slash_bps_per_event as u64 <= BPS_DENOM,
            StakeGovError::InvalidConfig
        );
        require!(
            slash_authorities.len() <= MAX_ALLOWLIST
                && snapshot_submitters.len() <= MAX_ALLOWLIST,
            StakeGovError::AllowlistTooLarge
        );

        // Validate lock tiers are non-decreasing in epochs and multipliers are sane.
        let mut prev_epochs = 0u64;
        for t in lock_tiers.iter() {
            require!(
                t.lock_epochs >= prev_epochs,
                StakeGovError::InvalidLockTiers
            );
            require!(
                t.multiplier_bps as u64 >= BPS_DENOM,
                StakeGovError::InvalidLockTiers
            );
            prev_epochs = t.lock_epochs;
        }

        // Derive and validate vault authority PDA.
        let (expected_vault_auth, vault_authority_bump) =
            Pubkey::find_program_address(&[SEED_VAULT_AUTH], ctx.program_id);
        require_keys_eq!(
            expected_vault_auth,
            ctx.accounts.vault_authority.key(),
            StakeGovError::InvalidVaultAuthority
        );

        // Create + initialize the vault token account (client provides the new account keypair).
        let rent = Rent::get()?;
        let vault_space: u64 = anchor_spl::token::spl_token::state::Account::LEN as u64;
        let vault_lamports = rent.minimum_balance(vault_space as usize);
        let payer_key = ctx.accounts.authority.key();
        let vault_key = ctx.accounts.vault.key();
        invoke(
            &system_instruction::create_account(
                &payer_key,
                &vault_key,
                vault_lamports,
                vault_space,
                &ctx.accounts.token_program.key(),
            ),
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;

        let init_ix = anchor_spl::token::spl_token::instruction::initialize_account(
            &ctx.accounts.token_program.key(),
            &vault_key,
            &stake_mint,
            &expected_vault_auth,
        )?;
        invoke(
            &init_ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.stake_mint.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        // Persist config.
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.stake_mint = stake_mint;
        config.vault = ctx.accounts.vault.key();
        config.vault_authority_bump = vault_authority_bump;
        config.epoch_len_slots = epoch_len_slots;
        config.min_stake = min_stake;
        config.max_verifiers = max_verifiers;
        config.dispute_window_epochs = dispute_window_epochs;
        config.exit_cooldown_epochs = exit_cooldown_epochs;
        config.min_lock_epochs = min_lock_epochs;
        config.max_lock_epochs = max_lock_epochs;
        config.jail_epochs_after_slash = jail_epochs_after_slash;
        config.max_slash_bps_per_event = max_slash_bps_per_event;
        config.lock_tiers = lock_tiers;

        config.slash_authorities = slash_authorities;
        config.snapshot_submitters = snapshot_submitters;

        config.bump = ctx.bumps.config;

        // Initialize verifier registry.
        let reg = &mut ctx.accounts.verifier_registry;
        reg.verifiers = Vec::new();
        reg.bump = ctx.bumps.verifier_registry;
        Ok(())
    }

    pub fn register_verifier(
        ctx: Context<RegisterVerifier>,
        verifier: Pubkey,
        commission_bps: u16,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.authority,
            StakeGovError::Unauthorized
        );
        require!(commission_bps as u64 <= BPS_DENOM, StakeGovError::InvalidCommission);

        let reg = &mut ctx.accounts.verifier_registry;

        let idx_opt = reg.find_index(&verifier);
        require!(idx_opt.is_none(), StakeGovError::VerifierAlreadyRegistered);

        require!(
            reg.verifiers.len() < MAX_VERIFIERS
                && (reg.verifiers.len() as u32) < ctx.accounts.config.max_verifiers,
            StakeGovError::VerifierRegistryFull
        );

        reg.verifiers.push(VerifierInfo {
            verifier,
            commission_bps,
            active: true,
            jailed_until_epoch: 0,
        });
        Ok(())
    }

    pub fn set_verifier_active(
        ctx: Context<SetVerifierActive>,
        verifier: Pubkey,
        active: bool,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.authority,
            StakeGovError::Unauthorized
        );
        let reg = &mut ctx.accounts.verifier_registry;
        let idx = reg
            .find_index(&verifier)
            .ok_or_else(|| error!(StakeGovError::VerifierNotFound))?;
        reg.verifiers[idx].active = active;
        Ok(())
    }

    pub fn init_stake_position(ctx: Context<InitStakePosition>) -> Result<()> {
        let p = &mut ctx.accounts.stake_position;
        p.owner = ctx.accounts.staker.key();
        p.staked_amount = 0;
        p.locked_amount = 0;
        p.lock_end_epoch = 0;
        p.lock_multiplier_bps = BPS_DENOM as u16;
        p.exit_requested_epoch = 0;
        p.pending_withdraw_amount = 0;
        p.delegated_to = Pubkey::default();
        p.delegation_slashable = false;
        p.last_slash_epoch = 0;
        p.bump = ctx.bumps.stake_position;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakeGovError::InvalidAmount);

        let config = &ctx.accounts.config;
        let owner = ctx.accounts.stake_position.owner;

        require_keys_eq!(owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);

        // Transfer stake tokens from the user's token account into the vault.
        validate_token_account_mint_owner(
            &ctx.accounts.staker_ata,
            &config.stake_mint,
            &ctx.accounts.staker.key(),
        )?;
        validate_token_account_mint_owner(
            &ctx.accounts.vault,
            &config.stake_mint,
            &ctx.accounts.vault_authority.key(),
        )?;
        require_keys_eq!(ctx.accounts.vault.key(), config.vault, StakeGovError::InvalidVault);

        token::transfer(ctx.accounts.transfer_to_vault_ctx(), amount)?;

        let p = &mut ctx.accounts.stake_position;
        p.staked_amount = p
            .staked_amount
            .checked_add(amount)
            .ok_or_else(|| error!(StakeGovError::MathOverflow))?;

        require!(p.staked_amount >= config.min_stake, StakeGovError::BelowMinStake);
        Ok(())
    }

    pub fn lock(ctx: Context<Lock>, amount: u64, lock_epochs: u64) -> Result<()> {
        require!(amount > 0, StakeGovError::InvalidAmount);
        let config = &ctx.accounts.config;
        let p = &mut ctx.accounts.stake_position;

        require_keys_eq!(p.owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);
        require!(
            lock_epochs >= config.min_lock_epochs && lock_epochs <= config.max_lock_epochs,
            StakeGovError::InvalidLockEpochs
        );

        let current_epoch = current_epoch(config)?;

        let available_liquid = p
            .staked_amount
            .saturating_sub(p.locked_amount)
            .saturating_sub(p.pending_withdraw_amount);
        require!(amount <= available_liquid, StakeGovError::InsufficientLiquid);

        p.locked_amount = p
            .locked_amount
            .checked_add(amount)
            .ok_or_else(|| error!(StakeGovError::MathOverflow))?;

        let new_end = current_epoch
            .checked_add(lock_epochs)
            .ok_or_else(|| error!(StakeGovError::MathOverflow))?;
        if new_end > p.lock_end_epoch {
            p.lock_end_epoch = new_end;
        }

        // Choose a multiplier from the tier table at lock-time (MVP).
        let chosen_mult = choose_multiplier_bps(&config.lock_tiers, lock_epochs);
        if chosen_mult > p.lock_multiplier_bps {
            p.lock_multiplier_bps = chosen_mult;
        }
        Ok(())
    }

    pub fn unlock_expired(ctx: Context<UnlockExpired>) -> Result<()> {
        let config = &ctx.accounts.config;
        let p = &mut ctx.accounts.stake_position;
        require_keys_eq!(p.owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);

        let current_epoch = current_epoch(config)?;
        if p.lock_end_epoch != 0 && current_epoch >= p.lock_end_epoch {
            p.locked_amount = 0;
            p.lock_end_epoch = 0;
            p.lock_multiplier_bps = BPS_DENOM as u16;
        }
        Ok(())
    }

    pub fn request_exit(ctx: Context<RequestExit>, amount: u64) -> Result<()> {
        require!(amount > 0, StakeGovError::InvalidAmount);
        let config = &ctx.accounts.config;
        let p = &mut ctx.accounts.stake_position;

        require_keys_eq!(p.owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);

        let available_liquid = p
            .staked_amount
            .saturating_sub(p.locked_amount)
            .saturating_sub(p.pending_withdraw_amount);
        require!(amount <= available_liquid, StakeGovError::InsufficientLiquid);

        p.pending_withdraw_amount = p
            .pending_withdraw_amount
            .checked_add(amount)
            .ok_or_else(|| error!(StakeGovError::MathOverflow))?;

        if p.exit_requested_epoch == 0 {
            p.exit_requested_epoch = current_epoch(config)?;
        }
        Ok(())
    }

    pub fn finalize_withdraw(ctx: Context<FinalizeWithdraw>) -> Result<()> {
        let config = &ctx.accounts.config;
        let owner = ctx.accounts.stake_position.owner;
        require_keys_eq!(owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);

        let exit_requested_epoch = ctx.accounts.stake_position.exit_requested_epoch;
        let pending_withdraw_amount = ctx.accounts.stake_position.pending_withdraw_amount;
        require!(exit_requested_epoch != 0, StakeGovError::ExitNotRequested);
        let current_epoch = current_epoch(config)?;
        let unlock_epoch = exit_requested_epoch
            .checked_add(config.exit_cooldown_epochs)
            .ok_or_else(|| error!(StakeGovError::MathOverflow))?;
        require!(current_epoch >= unlock_epoch, StakeGovError::ExitCooldown);

        let amount = pending_withdraw_amount;
        require!(amount > 0, StakeGovError::InvalidAmount);

        // Transfer from vault to user ATA, signed by vault authority PDA.
        validate_token_account_mint_owner(
            &ctx.accounts.staker_ata,
            &config.stake_mint,
            &ctx.accounts.staker.key(),
        )?;
        validate_token_account_mint_owner(
            &ctx.accounts.vault,
            &config.stake_mint,
            &ctx.accounts.vault_authority.key(),
        )?;
        require_keys_eq!(ctx.accounts.vault.key(), config.vault, StakeGovError::InvalidVault);

        let signer_seeds: &[&[u8]] = &[SEED_VAULT_AUTH, &[config.vault_authority_bump]];
        token::transfer(
            ctx.accounts
                .transfer_to_user_ctx()
                .with_signer(&[signer_seeds]),
            amount,
        )?;

        let p = &mut ctx.accounts.stake_position;
        p.staked_amount = p
            .staked_amount
            .checked_sub(amount)
            .ok_or_else(|| error!(StakeGovError::MathOverflow))?;
        p.pending_withdraw_amount = 0;
        p.exit_requested_epoch = 0;
        Ok(())
    }

    pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Pubkey) -> Result<()> {
        let config = &ctx.accounts.config;
        let p = &mut ctx.accounts.stake_position;
        require_keys_eq!(p.owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);

        if delegate == Pubkey::default() {
            p.delegated_to = Pubkey::default();
            return Ok(());
        }

        let current_epoch = current_epoch(config)?;
        let reg = &ctx.accounts.verifier_registry;
        let idx = reg
            .find_index(&delegate)
            .ok_or_else(|| error!(StakeGovError::VerifierNotFound))?;
        let v = &reg.verifiers[idx];
        require!(v.active, StakeGovError::VerifierNotActive);
        require!(v.jailed_until_epoch <= current_epoch, StakeGovError::VerifierJailed);

        p.delegated_to = delegate;
        Ok(())
    }

    pub fn set_delegation_slashable(
        ctx: Context<SetDelegationSlashable>,
        delegation_slashable: bool,
    ) -> Result<()> {
        let p = &mut ctx.accounts.stake_position;
        require_keys_eq!(p.owner, ctx.accounts.staker.key(), StakeGovError::Unauthorized);
        p.delegation_slashable = delegation_slashable;
        Ok(())
    }

    pub fn submit_snapshot(
        ctx: Context<SubmitSnapshot>,
        epoch_id: u64,
        root: [u8; 32],
        total_weight: u128,
    ) -> Result<()> {
        require!(
            is_allowlisted_vec(&ctx.accounts.config.snapshot_submitters, &ctx.accounts.submitter.key()),
            StakeGovError::Unauthorized
        );

        let s = &mut ctx.accounts.snapshot;
        s.epoch_id = epoch_id;
        s.root = root;
        s.total_weight = total_weight;
        s.created_at_slot = Clock::get()?.slot;
        s.created_by = ctx.accounts.submitter.key();
        s.bump = ctx.bumps.snapshot;
        Ok(())
    }

    pub fn apply_slash(
        ctx: Context<ApplySlash>,
        epoch_id: u64,
        slash_bps: u16,
        reason_hash: [u8; 32],
        evidence_ref: [u8; 32],
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            is_allowlisted_vec(&config.slash_authorities, &ctx.accounts.slasher.key()),
            StakeGovError::Unauthorized
        );
        require!(
            slash_bps <= config.max_slash_bps_per_event,
            StakeGovError::SlashTooLarge
        );

        let current_epoch = current_epoch(config)?;
        require!(
            current_epoch <= epoch_id.saturating_add(config.dispute_window_epochs),
            StakeGovError::SlashOutsideDisputeWindow
        );

        let offender_key = ctx.accounts.offender.key();
        let p = &mut ctx.accounts.offender_position;
        require_keys_eq!(p.owner, offender_key, StakeGovError::InvalidOffenderPosition);

        let amount_slashed = mul_bps(p.staked_amount, slash_bps)?;

        // Reduce stake accounting (MVP: only offender's own position).
        if amount_slashed > 0 {
            // Slash from liquid first, then from locked if needed.
            let liquid_total = p.staked_amount.saturating_sub(p.locked_amount);
            let from_liquid = core::cmp::min(liquid_total, amount_slashed);
            let mut remaining = amount_slashed.saturating_sub(from_liquid);
            if remaining > 0 {
                let from_locked = core::cmp::min(p.locked_amount, remaining);
                p.locked_amount = p.locked_amount.saturating_sub(from_locked);
                remaining = remaining.saturating_sub(from_locked);
                let _ = remaining; // any remainder is impossible given caps, but keep saturating logic.
                if p.locked_amount == 0 {
                    p.lock_end_epoch = 0;
                    p.lock_multiplier_bps = BPS_DENOM as u16;
                }
            }

            p.staked_amount = p.staked_amount.saturating_sub(amount_slashed);

            // If pending withdrawal exceeds remaining liquid, shrink it.
            let max_pending = p.staked_amount.saturating_sub(p.locked_amount);
            if p.pending_withdraw_amount > max_pending {
                p.pending_withdraw_amount = max_pending;
                if p.pending_withdraw_amount == 0 {
                    p.exit_requested_epoch = 0;
                }
            }
        }

        p.last_slash_epoch = current_epoch;

        // Jail if offender is a registered verifier.
        let reg = &mut ctx.accounts.verifier_registry;
        if let Some(idx) = reg.find_index(&offender_key) {
            let jail_until = current_epoch
                .checked_add(config.jail_epochs_after_slash)
                .ok_or_else(|| error!(StakeGovError::MathOverflow))?;
            if jail_until > reg.verifiers[idx].jailed_until_epoch {
                reg.verifiers[idx].jailed_until_epoch = jail_until;
            }
        }

        let r = &mut ctx.accounts.slash_record;
        r.epoch_id = epoch_id;
        r.offender = offender_key;
        r.slash_bps = slash_bps;
        r.amount_slashed = amount_slashed;
        r.reason_hash = reason_hash;
        r.evidence_ref = evidence_ref;
        r.applied_at_slot = Clock::get()?.slot;
        r.applied_by = ctx.accounts.slasher.key();
        r.bump = ctx.bumps.slash_record;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + StakeGovConfig::SIZE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + VerifierRegistry::SIZE,
        seeds = [SEED_VERIFIER_REGISTRY],
        bump
    )]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    /// CHECK: PDA authority for the vault token account.
    #[account(seeds = [SEED_VAULT_AUTH], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// Vault token account. Created inside this instruction. Must be a signer (new keypair).
    /// CHECK: created + initialized as SPL token account in handler.
    #[account(mut)]
    pub vault: Signer<'info>,

    /// CHECK: verified via SPL token initialize.
    pub stake_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RegisterVerifier<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(mut, seeds = [SEED_VERIFIER_REGISTRY], bump = verifier_registry.bump)]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetVerifierActive<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(mut, seeds = [SEED_VERIFIER_REGISTRY], bump = verifier_registry.bump)]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitStakePosition<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        init,
        payer = staker,
        space = 8 + StakePosition::SIZE,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    #[account(mut)]
    pub staker: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    /// CHECK: PDA authority for the vault token account.
    #[account(seeds = [SEED_VAULT_AUTH], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: validated in handler (must be SPL token account for config.stake_mint, owned by vault_authority).
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    /// CHECK: validated in handler (must be SPL token account for config.stake_mint, owned by staker).
    #[account(mut)]
    pub staker_ata: UncheckedAccount<'info>,

    #[account(mut)]
    pub staker: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Stake<'info> {
    fn transfer_to_vault_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.staker_ata.to_account_info(),
                to: self.vault.to_account_info(),
                authority: self.staker.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct Lock<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub staker: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnlockExpired<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub staker: Signer<'info>,
}

#[derive(Accounts)]
pub struct RequestExit<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub staker: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinalizeWithdraw<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    /// CHECK: PDA authority for the vault token account.
    #[account(seeds = [SEED_VAULT_AUTH], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: validated in handler.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    /// CHECK: validated in handler.
    #[account(mut)]
    pub staker_ata: UncheckedAccount<'info>,

    #[account(mut)]
    pub staker: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

impl<'info> FinalizeWithdraw<'info> {
    fn transfer_to_user_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: self.staker_ata.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct SetDelegate<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(seeds = [SEED_VERIFIER_REGISTRY], bump = verifier_registry.bump)]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub staker: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetDelegationSlashable<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        mut,
        seeds = [SEED_STAKE, staker.key().as_ref()],
        bump = stake_position.bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub staker: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct SubmitSnapshot<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(
        init,
        payer = submitter,
        space = 8 + StakeSnapshot::SIZE,
        seeds = [SEED_SNAPSHOT, epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub snapshot: Account<'info, StakeSnapshot>,

    #[account(mut)]
    pub submitter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, slash_bps: u16, reason_hash: [u8; 32])]
pub struct ApplySlash<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, StakeGovConfig>,

    #[account(mut, seeds = [SEED_VERIFIER_REGISTRY], bump = verifier_registry.bump)]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    /// CHECK: offender wallet pubkey. Used to derive offender_position PDA.
    pub offender: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SEED_STAKE, offender.key().as_ref()],
        bump = offender_position.bump
    )]
    pub offender_position: Account<'info, StakePosition>,

    #[account(
        init,
        payer = slasher,
        space = 8 + SlashRecord::SIZE,
        seeds = [
            SEED_SLASH,
            epoch_id.to_le_bytes().as_ref(),
            offender.key().as_ref(),
            reason_hash.as_ref(),
        ],
        bump
    )]
    pub slash_record: Account<'info, SlashRecord>,

    #[account(mut)]
    pub slasher: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct StakeGovConfig {
    pub authority: Pubkey,
    pub stake_mint: Pubkey,
    pub vault: Pubkey,
    pub vault_authority_bump: u8,
    pub epoch_len_slots: u64,
    pub min_stake: u64,
    pub max_verifiers: u32,
    pub dispute_window_epochs: u64,
    pub exit_cooldown_epochs: u64,
    pub min_lock_epochs: u64,
    pub max_lock_epochs: u64,
    pub jail_epochs_after_slash: u64,
    pub max_slash_bps_per_event: u16,
    pub lock_tiers: [LockTier; MAX_LOCK_TIERS],
    pub slash_authorities: Vec<Pubkey>,
    pub snapshot_submitters: Vec<Pubkey>,
    pub bump: u8,
}

impl StakeGovConfig {
    pub const SIZE: usize =
        32  // authority
        + 32  // stake_mint
        + 32  // vault
        + 1   // vault_authority_bump
        + 8   // epoch_len_slots
        + 8   // min_stake
        + 4   // max_verifiers
        + 8   // dispute_window_epochs
        + 8   // exit_cooldown_epochs
        + 8   // min_lock_epochs
        + 8   // max_lock_epochs
        + 8   // jail_epochs_after_slash
        + 2   // max_slash_bps_per_event
        + LockTier::SIZE * MAX_LOCK_TIERS
        + 4 + 32 * MAX_ALLOWLIST // slash_authorities vec (max)
        + 4 + 32 * MAX_ALLOWLIST // snapshot_submitters vec (max)
        + 1;  // bump
}

#[account]
pub struct VerifierRegistry {
    pub verifiers: Vec<VerifierInfo>,
    pub bump: u8,
}

impl VerifierRegistry {
    // Vec is length-prefixed by a u32.
    pub const SIZE: usize = 4 + (VerifierInfo::SIZE * MAX_VERIFIERS) + 1;

    pub fn find_index(&self, k: &Pubkey) -> Option<usize> {
        for (i, v) in self.verifiers.iter().enumerate() {
            if &v.verifier == k {
                return Some(i);
            }
        }
        None
    }
}

#[account]
pub struct StakePosition {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub locked_amount: u64,
    pub lock_end_epoch: u64,
    pub lock_multiplier_bps: u16,
    pub exit_requested_epoch: u64,
    pub pending_withdraw_amount: u64,
    pub delegated_to: Pubkey,
    pub delegation_slashable: bool,
    pub last_slash_epoch: u64,
    pub bump: u8,
}

impl StakePosition {
    pub const SIZE: usize =
        32  // owner
        + 8   // staked_amount
        + 8   // locked_amount
        + 8   // lock_end_epoch
        + 2   // lock_multiplier_bps
        + 8   // exit_requested_epoch
        + 8   // pending_withdraw_amount
        + 32  // delegated_to
        + 1   // delegation_slashable
        + 8   // last_slash_epoch
        + 1;  // bump
}

#[account]
pub struct StakeSnapshot {
    pub epoch_id: u64,
    pub root: [u8; 32],
    pub total_weight: u128,
    pub created_at_slot: u64,
    pub created_by: Pubkey,
    pub bump: u8,
}

impl StakeSnapshot {
    pub const SIZE: usize = 8 + 32 + 16 + 8 + 32 + 1;
}

#[account]
pub struct SlashRecord {
    pub epoch_id: u64,
    pub offender: Pubkey,
    pub slash_bps: u16,
    pub amount_slashed: u64,
    pub reason_hash: [u8; 32],
    pub evidence_ref: [u8; 32],
    pub applied_at_slot: u64,
    pub applied_by: Pubkey,
    pub bump: u8,
}

impl SlashRecord {
    pub const SIZE: usize = 8 + 32 + 2 + 8 + 32 + 32 + 8 + 32 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, Default)]
pub struct LockTier {
    pub lock_epochs: u64,
    pub multiplier_bps: u16,
}

impl LockTier {
    pub const SIZE: usize = 8 + 2;
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, Default)]
pub struct VerifierInfo {
    pub verifier: Pubkey,
    pub commission_bps: u16,
    pub active: bool,
    pub jailed_until_epoch: u64,
}

impl VerifierInfo {
    pub const SIZE: usize = 32 + 2 + 1 + 8;
}

fn current_epoch(config: &StakeGovConfig) -> Result<u64> {
    let slot = Clock::get()?.slot;
    Ok(slot / config.epoch_len_slots)
}

fn choose_multiplier_bps(tiers: &[LockTier; MAX_LOCK_TIERS], lock_epochs: u64) -> u16 {
    let mut chosen = BPS_DENOM as u16;
    for t in tiers.iter() {
        if lock_epochs >= t.lock_epochs {
            chosen = t.multiplier_bps;
        }
    }
    chosen
}

fn mul_bps(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or_else(|| error!(StakeGovError::MathOverflow))?
        / (BPS_DENOM as u128);
    Ok(v as u64)
}

fn is_allowlisted_vec(list: &[Pubkey], k: &Pubkey) -> bool {
    list.iter().any(|x| x == k)
}

fn validate_token_account_mint_owner(
    acct: &UncheckedAccount,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
) -> Result<()> {
    let info = acct.to_account_info();
    require_keys_eq!(
        *info.owner,
        anchor_spl::token::spl_token::id(),
        StakeGovError::InvalidTokenAccount
    );
    let data = info.try_borrow_data()?;
    let parsed = anchor_spl::token::spl_token::state::Account::unpack(&data)
        .map_err(|_| error!(StakeGovError::InvalidTokenAccount))?;
    require_keys_eq!(parsed.mint, *expected_mint, StakeGovError::InvalidTokenMint);
    require_keys_eq!(parsed.owner, *expected_owner, StakeGovError::InvalidTokenOwner);
    Ok(())
}

#[error_code]
pub enum StakeGovError {
    #[msg("unauthorized")]
    Unauthorized,
    #[msg("invalid config")]
    InvalidConfig,
    #[msg("allowlist too large")]
    AllowlistTooLarge,
    #[msg("invalid lock tiers")]
    InvalidLockTiers,
    #[msg("invalid vault authority PDA")]
    InvalidVaultAuthority,
    #[msg("verifier already registered")]
    VerifierAlreadyRegistered,
    #[msg("verifier registry full")]
    VerifierRegistryFull,
    #[msg("verifier not found")]
    VerifierNotFound,
    #[msg("verifier not active")]
    VerifierNotActive,
    #[msg("verifier is jailed")]
    VerifierJailed,
    #[msg("invalid commission bps")]
    InvalidCommission,
    #[msg("invalid amount")]
    InvalidAmount,
    #[msg("below minimum stake")]
    BelowMinStake,
    #[msg("invalid lock epochs")]
    InvalidLockEpochs,
    #[msg("insufficient liquid balance")]
    InsufficientLiquid,
    #[msg("exit not requested")]
    ExitNotRequested,
    #[msg("exit cooldown not complete")]
    ExitCooldown,
    #[msg("slash too large")]
    SlashTooLarge,
    #[msg("slash outside dispute window")]
    SlashOutsideDisputeWindow,
    #[msg("invalid token account")]
    InvalidTokenAccount,
    #[msg("invalid token mint")]
    InvalidTokenMint,
    #[msg("invalid token owner")]
    InvalidTokenOwner,
    #[msg("invalid vault account")]
    InvalidVault,
    #[msg("invalid offender position")]
    InvalidOffenderPosition,
    #[msg("math overflow")]
    MathOverflow,
}
