use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo, Token};

declare_id!("FTeUikzSsLcr2U9WMhs7y5n4cLyjMwg59FB7wWmWYo86");

#[program]
pub mod ddns_stake {
    use super::*;

    pub fn init_stake_config(
        ctx: Context<InitStakeConfig>,
        epoch_len_slots: u64,
        reward_rate_per_epoch: u64,
        min_lock_epochs: u64,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, StakeError::BadEpochLen);

        // Create the stake_vault PDA as a 0-data system account (holds SOL).
        // This keeps stake custody auditable and avoids storing large on-chain data.
        require!(
            ctx.accounts.stake_vault.data_is_empty() && ctx.accounts.stake_vault.lamports() == 0,
            StakeError::VaultAlreadyExists
        );

        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(0);
        let vault_seeds: &[&[u8]] = &[b"stake_vault", &[ctx.bumps.stake_vault]];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
        let create_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.stake_vault.key(),
            lamports,
            0,
            &anchor_lang::solana_program::system_program::ID,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.stake_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Create the mint_authority PDA as a 0-data system account so it can be used as a signer
        // in Token Program CPIs.
        require!(
            ctx.accounts.mint_authority.data_is_empty() && ctx.accounts.mint_authority.lamports() == 0,
            StakeError::MintAuthorityAlreadyExists
        );
        let mint_seeds: &[&[u8]] = &[b"mint_authority", &[ctx.bumps.mint_authority]];
        let mint_signer_seeds: &[&[&[u8]]] = &[mint_seeds];
        let create_mint_auth_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.mint_authority.key(),
            lamports,
            0,
            &anchor_lang::solana_program::system_program::ID,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_mint_auth_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.mint_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            mint_signer_seeds,
        )?;

        let cfg = &mut ctx.accounts.stake_config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.reward_rate_per_epoch = reward_rate_per_epoch;
        cfg.min_lock_epochs = min_lock_epochs;
        cfg.reward_mint = ctx.accounts.reward_mint.key();
        cfg.total_stake = 0;
        cfg.bump = ctx.bumps.stake_config;
        cfg.stake_vault_bump = ctx.bumps.stake_vault;
        cfg.mint_authority_bump = ctx.bumps.mint_authority;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, StakeError::BadAmount);

        let slot = Clock::get()?.slot;
        let cfg = &mut ctx.accounts.stake_config;
        let epoch = slot / cfg.epoch_len_slots;

        // Transfer SOL into the vault PDA.
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &ctx.accounts.stake_vault.key(),
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.stake_vault.to_account_info(),
            ],
        )?;

        let pos = &mut ctx.accounts.stake_position;
        if pos.staked_amount == 0 {
            pos.owner = ctx.accounts.owner.key();
            pos.last_claimed_epoch = epoch;
            pos.delegate_to_verifier = Pubkey::default();
            pos.bump = ctx.bumps.stake_position;
        }

        pos.staked_amount = pos
            .staked_amount
            .checked_add(amount_lamports)
            .ok_or(StakeError::Overflow)?;

        // Extend/refresh lock.
        let new_lock = epoch
            .checked_add(cfg.min_lock_epochs)
            .ok_or(StakeError::Overflow)?;
        if new_lock > pos.locked_until_epoch {
            pos.locked_until_epoch = new_lock;
        }

        cfg.total_stake = cfg
            .total_stake
            .checked_add(amount_lamports)
            .ok_or(StakeError::Overflow)?;
        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, StakeError::BadAmount);

        let slot = Clock::get()?.slot;
        let cfg = &mut ctx.accounts.stake_config;
        let epoch = slot / cfg.epoch_len_slots;
        let pos = &mut ctx.accounts.stake_position;

        require!(epoch >= pos.locked_until_epoch, StakeError::StillLocked);
        require!(pos.staked_amount >= amount_lamports, StakeError::InsufficientStake);

        pos.staked_amount = pos
            .staked_amount
            .checked_sub(amount_lamports)
            .ok_or(StakeError::Overflow)?;
        cfg.total_stake = cfg
            .total_stake
            .checked_sub(amount_lamports)
            .ok_or(StakeError::Overflow)?;

        // Transfer SOL from vault PDA back to the owner.
        let vault_seeds: &[&[u8]] = &[b"stake_vault", &[cfg.stake_vault_bump]];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.stake_vault.key(),
            &ctx.accounts.owner.key(),
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.stake_vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let slot = Clock::get()?.slot;
        let cfg = &mut ctx.accounts.stake_config;
        let epoch = slot / cfg.epoch_len_slots;
        let pos = &mut ctx.accounts.stake_position;

        require!(cfg.total_stake > 0, StakeError::NoTotalStake);
        require!(pos.staked_amount > 0, StakeError::NoStake);
        require!(epoch >= pos.last_claimed_epoch, StakeError::BadEpoch);

        let delta_epochs = epoch
            .checked_sub(pos.last_claimed_epoch)
            .ok_or(StakeError::Overflow)?;
        require!(delta_epochs > 0, StakeError::NothingToClaim);

        // MVP simplification: use current total_stake for the pro-rata calculation.
        let numer = (cfg.reward_rate_per_epoch as u128)
            .checked_mul(delta_epochs as u128)
            .ok_or(StakeError::Overflow)?
            .checked_mul(pos.staked_amount as u128)
            .ok_or(StakeError::Overflow)?;
        let reward = (numer / (cfg.total_stake as u128)) as u64;
        require!(reward > 0, StakeError::NothingToClaim);

        let mint_seeds: &[&[u8]] = &[b"mint_authority", &[cfg.mint_authority_bump]];
        let signer_seeds: &[&[&[u8]]] = &[mint_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.reward_mint.to_account_info(),
                to: ctx.accounts.user_reward_ata.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::mint_to(cpi_ctx, reward)?;

        pos.last_claimed_epoch = epoch;
        Ok(())
    }

    pub fn delegate_to_verifier(ctx: Context<DelegateToVerifier>, verifier: Pubkey) -> Result<()> {
        ctx.accounts.stake_position.delegate_to_verifier = verifier;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitStakeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + StakeConfig::SIZE,
        seeds = [b"stake_config"],
        bump
    )]
    pub stake_config: Account<'info, StakeConfig>,

    /// CHECK: created manually in init_stake_config as a 0-data system account.
    #[account(mut, seeds = [b"stake_vault"], bump)]
    pub stake_vault: UncheckedAccount<'info>,

    /// CHECK: created manually in init_stake_config as a 0-data system account.
    #[account(mut, seeds = [b"mint_authority"], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: Existing SPL mint for rewards (created off-chain in MVP).
    #[account(mut)]
    pub reward_mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [b"stake_config"], bump = stake_config.bump)]
    pub stake_config: Account<'info, StakeConfig>,

    #[account(mut, seeds = [b"stake_vault"], bump = stake_config.stake_vault_bump)]
    pub stake_vault: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + StakePosition::SIZE,
        seeds = [b"stake", owner.key().as_ref()],
        bump
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [b"stake_config"], bump = stake_config.bump)]
    pub stake_config: Account<'info, StakeConfig>,

    #[account(mut, seeds = [b"stake_vault"], bump = stake_config.stake_vault_bump)]
    pub stake_vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"stake", owner.key().as_ref()],
        bump = stake_position.bump,
        has_one = owner
    )]
    pub stake_position: Account<'info, StakePosition>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [b"stake_config"], bump = stake_config.bump)]
    pub stake_config: Account<'info, StakeConfig>,

    #[account(
        mut,
        seeds = [b"stake", owner.key().as_ref()],
        bump = stake_position.bump,
        has_one = owner
    )]
    pub stake_position: Account<'info, StakePosition>,

    /// CHECK: SPL mint for rewards.
    #[account(mut)]
    pub reward_mint: UncheckedAccount<'info>,

    /// CHECK: Destination SPL token account (user's ATA).
    #[account(mut)]
    pub user_reward_ata: UncheckedAccount<'info>,

    /// CHECK: PDA signer for mint authority.
    #[account(seeds = [b"mint_authority"], bump = stake_config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DelegateToVerifier<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake", owner.key().as_ref()],
        bump = stake_position.bump,
        has_one = owner
    )]
    pub stake_position: Account<'info, StakePosition>,
}

#[account]
pub struct StakeConfig {
    pub authority: Pubkey,
    pub epoch_len_slots: u64,
    pub reward_rate_per_epoch: u64,
    pub min_lock_epochs: u64,
    pub reward_mint: Pubkey,
    pub total_stake: u64,
    pub bump: u8,
    pub stake_vault_bump: u8,
    pub mint_authority_bump: u8,
}

impl StakeConfig {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1 + 1;
}

#[account]
pub struct StakePosition {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub last_claimed_epoch: u64,
    pub locked_until_epoch: u64,
    pub delegate_to_verifier: Pubkey,
    pub bump: u8,
}

impl StakePosition {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 32 + 1;
}

#[error_code]
pub enum StakeError {
    #[msg("Bad epoch length.")]
    BadEpochLen,
    #[msg("Bad amount.")]
    BadAmount,
    #[msg("Still locked.")]
    StillLocked,
    #[msg("Insufficient stake.")]
    InsufficientStake,
    #[msg("No stake.")]
    NoStake,
    #[msg("No total stake.")]
    NoTotalStake,
    #[msg("Nothing to claim.")]
    NothingToClaim,
    #[msg("Bad epoch.")]
    BadEpoch,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Stake vault already exists.")]
    VaultAlreadyExists,
    #[msg("Mint authority already exists.")]
    MintAuthorityAlreadyExists,
}
