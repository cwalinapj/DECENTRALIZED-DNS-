use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, program::invoke_signed, program_pack::Pack};

declare_id!("3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V");

const BPS_DENOM: u128 = 10_000;
const MAX_DIVERSITY_BONUS_BPS: u16 = 2_000; // +20%

#[program]
pub mod ddns_witness_rewards {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn init_config(
        ctx: Context<InitConfig>,
        epoch_len_slots: u64,
        max_reward_per_epoch: u64,
        min_bond_lamports: u64,
        reward_per_receipt: u64,
        max_rewardable_receipts_per_miner_per_epoch: u32,
        cooldown_slots: u64,
        enabled: bool,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, WitnessRewardsError::InvalidConfig);
        validate_mint_account(
            &ctx.accounts.toll_mint.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        validate_token_account(
            &ctx.accounts.reward_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
            &ctx.accounts.toll_mint.key(),
            &ctx.accounts.vault_authority.key(),
        )?;

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.toll_mint = ctx.accounts.toll_mint.key();
        cfg.reward_vault = ctx.accounts.reward_vault.key();
        cfg.vault_authority_bump = ctx.bumps.vault_authority;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.max_reward_per_epoch = max_reward_per_epoch;
        cfg.min_bond_lamports = min_bond_lamports;
        cfg.reward_per_receipt = reward_per_receipt;
        cfg.max_rewardable_receipts_per_miner_per_epoch = max_rewardable_receipts_per_miner_per_epoch;
        cfg.cooldown_slots = cooldown_slots;
        cfg.enabled = enabled;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_enabled(ctx: Context<SetEnabled>, enabled: bool) -> Result<()> {
        ctx.accounts.config.enabled = enabled;
        Ok(())
    }

    pub fn fund_reward_vault(ctx: Context<FundRewardVault>, amount: u64) -> Result<()> {
        require!(amount > 0, WitnessRewardsError::InvalidAmount);
        let cfg = &ctx.accounts.config;

        validate_token_account(
            &ctx.accounts.funder_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
            &cfg.toll_mint,
            &ctx.accounts.funder.key(),
        )?;
        validate_token_account(
            &ctx.accounts.reward_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
            &cfg.toll_mint,
            &ctx.accounts.vault_authority.key(),
        )?;

        let ix = spl_token::instruction::transfer(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.funder_ata.key(),
            &ctx.accounts.reward_vault.key(),
            &ctx.accounts.funder.key(),
            &[],
            amount,
        )?;
        invoke(
            &ix,
            &[
                ctx.accounts.funder_ata.to_account_info(),
                ctx.accounts.reward_vault.to_account_info(),
                ctx.accounts.funder.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;
        Ok(())
    }

    pub fn deposit_bond(ctx: Context<DepositBond>, lamports: u64) -> Result<()> {
        require!(lamports > 0, WitnessRewardsError::InvalidAmount);

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.miner.key(),
            &ctx.accounts.bond.key(),
            lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.miner.to_account_info(),
                ctx.accounts.bond.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let bond = &mut ctx.accounts.bond;
        bond.miner = ctx.accounts.miner.key();
        bond.bond_lamports = bond
            .bond_lamports
            .checked_add(lamports)
            .ok_or(error!(WitnessRewardsError::MathOverflow))?;
        bond.last_action_slot = Clock::get()?.slot;
        bond.bump = ctx.bumps.bond;
        Ok(())
    }

    pub fn withdraw_bond(ctx: Context<WithdrawBond>, lamports: u64) -> Result<()> {
        require!(lamports > 0, WitnessRewardsError::InvalidAmount);
        let now = Clock::get()?.slot;

        let cfg = &ctx.accounts.config;
        let current = ctx.accounts.bond.to_account_info().lamports();
        let bond_view = &ctx.accounts.bond;
        require!(
            now >= bond_view.last_action_slot.saturating_add(cfg.cooldown_slots),
            WitnessRewardsError::CooldownNotMet
        );
        require!(bond_view.bond_lamports >= lamports, WitnessRewardsError::InsufficientBond);

        let rent = Rent::get()?;
        let min_lamports = rent.minimum_balance(8 + MinerBond::SIZE);
        require!(
            current.saturating_sub(lamports) >= min_lamports,
            WitnessRewardsError::BondRentViolation
        );

        **ctx.accounts.bond.to_account_info().try_borrow_mut_lamports()? -= lamports;
        **ctx.accounts.miner.to_account_info().try_borrow_mut_lamports()? += lamports;

        let bond = &mut ctx.accounts.bond;
        bond.bond_lamports = bond
            .bond_lamports
            .checked_sub(lamports)
            .ok_or(error!(WitnessRewardsError::MathOverflow))?;
        bond.last_action_slot = now;
        Ok(())
    }

    pub fn submit_receipt_batch(
        ctx: Context<SubmitReceiptBatch>,
        epoch_id: u64,
        receipts_root: [u8; 32],
        receipt_count: u32,
        unique_name_hashes: u32,
        unique_colos: u16,
    ) -> Result<()> {
        require!(ctx.accounts.config.enabled, WitnessRewardsError::Disabled);
        require!(receipt_count > 0, WitnessRewardsError::InvalidAmount);

        let cfg = &ctx.accounts.config;
        let now_slot = Clock::get()?.slot;
        let current_epoch = now_slot / cfg.epoch_len_slots;
        require!(epoch_id == current_epoch, WitnessRewardsError::BadEpoch);
        require!(
            ctx.accounts.bond.bond_lamports >= cfg.min_bond_lamports,
            WitnessRewardsError::InsufficientBond
        );

        let stats = &mut ctx.accounts.epoch_stats;
        if stats.miner == Pubkey::default() {
            stats.epoch_id = epoch_id;
            stats.miner = ctx.accounts.miner.key();
            stats.bump = ctx.bumps.epoch_stats;
        } else {
            require!(stats.miner == ctx.accounts.miner.key(), WitnessRewardsError::InvalidMiner);
            require!(stats.epoch_id == epoch_id, WitnessRewardsError::BadEpoch);
            require!(stats.last_receipts_root != receipts_root, WitnessRewardsError::DuplicateRoot);
            require!(!stats.claimed, WitnessRewardsError::AlreadyClaimed);
        }

        let remaining_cap = cfg
            .max_rewardable_receipts_per_miner_per_epoch
            .saturating_sub(stats.rewardable_receipts);
        let rewardable = receipt_count.min(remaining_cap);

        let diversity_bonus_bps = compute_diversity_bonus_bps(unique_name_hashes, unique_colos);
        let bonus_bps_total: u128 = (10_000u128)
            .checked_add(diversity_bonus_bps as u128)
            .ok_or(error!(WitnessRewardsError::MathOverflow))?;

        let delta_reward: u64 = ((rewardable as u128)
            .checked_mul(cfg.reward_per_receipt as u128)
            .ok_or(error!(WitnessRewardsError::MathOverflow))?
            .checked_mul(bonus_bps_total)
            .ok_or(error!(WitnessRewardsError::MathOverflow))?
            / BPS_DENOM) as u64;

        let epoch_state = &mut ctx.accounts.epoch_state;
        if epoch_state.epoch_id == 0 {
            epoch_state.epoch_id = epoch_id;
            epoch_state.bump = ctx.bumps.epoch_state;
        } else {
            require!(epoch_state.epoch_id == epoch_id, WitnessRewardsError::BadEpoch);
        }

        let remaining_epoch_budget = cfg
            .max_reward_per_epoch
            .saturating_sub(epoch_state.total_accrued_rewards);
        let delta_capped = delta_reward.min(remaining_epoch_budget);

        stats.submitted_receipts = stats.submitted_receipts.saturating_add(receipt_count);
        stats.rewardable_receipts = stats.rewardable_receipts.saturating_add(rewardable);
        stats.unique_name_hashes = stats.unique_name_hashes.saturating_add(unique_name_hashes);
        stats.unique_colos = stats.unique_colos.saturating_add(unique_colos);
        stats.earned_reward = stats.earned_reward.saturating_add(delta_capped);
        stats.last_receipts_root = receipts_root;
        stats.last_submission_slot = now_slot;

        epoch_state.total_submitted_receipts = epoch_state.total_submitted_receipts.saturating_add(receipt_count as u64);
        epoch_state.total_rewardable_receipts = epoch_state.total_rewardable_receipts.saturating_add(rewardable as u64);
        epoch_state.total_accrued_rewards = epoch_state.total_accrued_rewards.saturating_add(delta_capped);

        emit!(BatchSubmitted {
            epoch_id,
            miner: ctx.accounts.miner.key(),
            receipts_root,
            receipt_count,
            rewardable_receipts: rewardable,
            delta_reward: delta_capped,
            diversity_bonus_bps,
        });

        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>, epoch_id: u64) -> Result<()> {
        let stats = &mut ctx.accounts.epoch_stats;
        require!(stats.epoch_id == epoch_id, WitnessRewardsError::BadEpoch);
        require!(stats.miner == ctx.accounts.miner.key(), WitnessRewardsError::InvalidMiner);
        require!(!stats.claimed, WitnessRewardsError::AlreadyClaimed);
        require!(stats.earned_reward > 0, WitnessRewardsError::NothingToClaim);

        let amount = stats.earned_reward;
        let cfg = &ctx.accounts.config;
        validate_token_account(
            &ctx.accounts.reward_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
            &cfg.toll_mint,
            &ctx.accounts.vault_authority.key(),
        )?;
        validate_token_account(
            &ctx.accounts.miner_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
            &cfg.toll_mint,
            &ctx.accounts.miner.key(),
        )?;

        let signer_seeds: &[&[u8]] =
            &[b"witness_rewards_vault_authority", &[cfg.vault_authority_bump]];
        let ix = spl_token::instruction::transfer(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.reward_vault.key(),
            &ctx.accounts.miner_toll_ata.key(),
            &ctx.accounts.vault_authority.key(),
            &[],
            amount,
        )?;
        invoke_signed(
            &ix,
            &[
                ctx.accounts.reward_vault.to_account_info(),
                ctx.accounts.miner_toll_ata.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        stats.claimed = true;
        emit!(RewardsClaimed {
            epoch_id,
            miner: ctx.accounts.miner.key(),
            amount,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: validated as SPL mint in instruction.
    pub toll_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + WitnessRewardsConfig::SIZE,
        seeds = [b"witness_rewards_config"],
        bump
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
    /// CHECK: PDA authority for reward vault transfers.
    #[account(
        seeds = [b"witness_rewards_vault_authority"],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    /// CHECK: validated as SPL token account in instruction.
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,
    /// CHECK: address checked.
    #[account(address = spl_token::ID)]
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetEnabled<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"witness_rewards_config"],
        bump = config.bump,
        has_one = authority @ WitnessRewardsError::Unauthorized,
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
}

#[derive(Accounts)]
pub struct FundRewardVault<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(
        seeds = [b"witness_rewards_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
    /// CHECK: validated in instruction.
    #[account(mut)]
    pub funder_ata: UncheckedAccount<'info>,
    /// CHECK: validated in instruction.
    #[account(mut, address = config.reward_vault @ WitnessRewardsError::InvalidVault)]
    pub reward_vault: UncheckedAccount<'info>,
    /// CHECK: address checked.
    #[account(address = spl_token::ID)]
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: PDA checked in instruction.
    pub vault_authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct DepositBond<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(
        seeds = [b"witness_rewards_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
    #[account(
        init_if_needed,
        payer = miner,
        space = 8 + MinerBond::SIZE,
        seeds = [b"bond", miner.key().as_ref()],
        bump
    )]
    pub bond: Account<'info, MinerBond>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawBond<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(
        seeds = [b"witness_rewards_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
    #[account(
        mut,
        seeds = [b"bond", miner.key().as_ref()],
        bump = bond.bump,
        constraint = bond.miner == miner.key() @ WitnessRewardsError::InvalidMiner,
    )]
    pub bond: Account<'info, MinerBond>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct SubmitReceiptBatch<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(
        seeds = [b"witness_rewards_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
    #[account(
        mut,
        seeds = [b"bond", miner.key().as_ref()],
        bump = bond.bump,
        constraint = bond.miner == miner.key() @ WitnessRewardsError::InvalidMiner,
    )]
    pub bond: Account<'info, MinerBond>,
    #[account(
        init_if_needed,
        payer = miner,
        space = 8 + EpochMinerStats::SIZE,
        seeds = [b"epoch_stats".as_ref(), &epoch_id.to_le_bytes(), miner.key().as_ref()],
        bump
    )]
    pub epoch_stats: Account<'info, EpochMinerStats>,
    #[account(
        init_if_needed,
        payer = miner,
        space = 8 + EpochState::SIZE,
        seeds = [b"epoch_state".as_ref(), &epoch_id.to_le_bytes()],
        bump
    )]
    pub epoch_state: Account<'info, EpochState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(
        seeds = [b"witness_rewards_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, WitnessRewardsConfig>,
    /// CHECK: PDA signer.
    #[account(
        seeds = [b"witness_rewards_vault_authority"],
        bump = config.vault_authority_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,
    /// CHECK: validated in instruction.
    #[account(mut, address = config.reward_vault @ WitnessRewardsError::InvalidVault)]
    pub reward_vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"epoch_stats", &epoch_id.to_le_bytes(), miner.key().as_ref()],
        bump = epoch_stats.bump,
    )]
    pub epoch_stats: Account<'info, EpochMinerStats>,
    /// CHECK: validated in instruction.
    #[account(mut)]
    pub miner_toll_ata: UncheckedAccount<'info>,
    /// CHECK: address checked.
    #[account(address = spl_token::ID)]
    pub token_program: UncheckedAccount<'info>,
}

#[account]
pub struct WitnessRewardsConfig {
    pub authority: Pubkey,
    pub toll_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub vault_authority_bump: u8,
    pub epoch_len_slots: u64,
    pub max_reward_per_epoch: u64,
    pub min_bond_lamports: u64,
    pub reward_per_receipt: u64,
    pub max_rewardable_receipts_per_miner_per_epoch: u32,
    pub cooldown_slots: u64,
    pub enabled: bool,
    pub bump: u8,
}

impl WitnessRewardsConfig {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 4 + 8 + 1 + 1;
}

#[account]
pub struct MinerBond {
    pub miner: Pubkey,
    pub bond_lamports: u64,
    pub last_action_slot: u64,
    pub bump: u8,
}

impl MinerBond {
    pub const SIZE: usize = 32 + 8 + 8 + 1;
}

#[account]
pub struct EpochMinerStats {
    pub epoch_id: u64,
    pub miner: Pubkey,
    pub rewardable_receipts: u32,
    pub submitted_receipts: u32,
    pub unique_name_hashes: u32,
    pub unique_colos: u16,
    pub earned_reward: u64,
    pub claimed: bool,
    pub last_receipts_root: [u8; 32],
    pub last_submission_slot: u64,
    pub bump: u8,
}

impl EpochMinerStats {
    pub const SIZE: usize = 8 + 32 + 4 + 4 + 4 + 2 + 8 + 1 + 32 + 8 + 1;
}

#[account]
pub struct EpochState {
    pub epoch_id: u64,
    pub total_submitted_receipts: u64,
    pub total_rewardable_receipts: u64,
    pub total_accrued_rewards: u64,
    pub bump: u8,
}

impl EpochState {
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 1;
}

#[event]
pub struct BatchSubmitted {
    pub epoch_id: u64,
    pub miner: Pubkey,
    pub receipts_root: [u8; 32],
    pub receipt_count: u32,
    pub rewardable_receipts: u32,
    pub delta_reward: u64,
    pub diversity_bonus_bps: u16,
}

#[event]
pub struct RewardsClaimed {
    pub epoch_id: u64,
    pub miner: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum WitnessRewardsError {
    #[msg("Invalid config")]
    InvalidConfig,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Program disabled")]
    Disabled,
    #[msg("Insufficient bond")]
    InsufficientBond,
    #[msg("Bad epoch")]
    BadEpoch,
    #[msg("Invalid miner")]
    InvalidMiner,
    #[msg("Duplicate receipts root")]
    DuplicateRoot,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid vault authority")]
    InvalidVaultAuthority,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("Bond cooldown not met")]
    CooldownNotMet,
    #[msg("Bond withdrawal would violate rent-exemption")]
    BondRentViolation,
}

fn compute_diversity_bonus_bps(unique_name_hashes: u32, unique_colos: u16) -> u16 {
    let name_bonus = unique_name_hashes.saturating_mul(10); // 0.1% per unique name
    let colo_bonus = (unique_colos as u32).saturating_mul(100); // 1% per colo
    (name_bonus.saturating_add(colo_bonus) as u16).min(MAX_DIVERSITY_BONUS_BPS)
}

fn validate_mint_account(
    ai: &AccountInfo<'_>,
    token_program: &Pubkey,
) -> Result<spl_token::state::Mint> {
    require_keys_eq!(*ai.owner, *token_program, WitnessRewardsError::InvalidMint);
    spl_token::state::Mint::unpack(&ai.data.borrow())
        .map_err(|_| error!(WitnessRewardsError::InvalidMint))
}

fn validate_token_account(
    ai: &AccountInfo<'_>,
    token_program: &Pubkey,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
) -> Result<spl_token::state::Account> {
    require_keys_eq!(*ai.owner, *token_program, WitnessRewardsError::InvalidVault);
    let parsed = spl_token::state::Account::unpack(&ai.data.borrow())
        .map_err(|_| error!(WitnessRewardsError::InvalidVault))?;
    require_keys_eq!(parsed.mint, *expected_mint, WitnessRewardsError::InvalidMint);
    require_keys_eq!(parsed.owner, *expected_owner, WitnessRewardsError::InvalidVaultAuthority);
    Ok(parsed)
}
