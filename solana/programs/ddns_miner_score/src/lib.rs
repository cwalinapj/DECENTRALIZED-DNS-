use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke,
    program::invoke_signed,
    program_pack::Pack,
    system_instruction,
};
use anchor_spl::token::{self, Token, Transfer};
use sha2::{Digest, Sha256};

declare_id!("B4nYLvM9KVH2vsHFqBdSScMwnE8GABQetfVv3U7BUbhL");

const BPS_DENOM: u128 = 10_000;
const SCORE_DENOM: u128 = 10_000; // scores in 0..10000

const MAX_SUBMITTERS: usize = 16;
const MAX_MINERS: usize = 64;

const SEED_CONFIG: &[u8] = b"miner_score_config";
const SEED_VAULT_AUTH: &[u8] = b"miner_score_vault_authority";
const SEED_REWARD_VAULT: &[u8] = b"reward_vault";
const SEED_MINER_EPOCH: &[u8] = b"miner_epoch";
const SEED_EPOCH_TOTALS: &[u8] = b"epoch_totals";
const SEED_CLAIM: &[u8] = b"claim";

const PREMIUM_NAME_ACCOUNT: &str = "PremiumName";

#[program]
pub mod ddns_miner_score {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn init_miner_score_config(
        ctx: Context<InitMinerScoreConfig>,
        epoch_len_slots: u64,
        base_reward_per_epoch: u64,
        per_miner_epoch_cap: u64,
        min_miner_stake_weight: u64,
        allowlisted_submitters: Vec<Pubkey>,
        allowlisted_miners: Vec<Pubkey>,
        alpha_correctness_bps: u16,
        alpha_diversity_bps: u16,
        alpha_timeliness_bps: u16,
        alpha_uptime_bps: u16,
        centralization_penalty_bps: u16,
        dominance_threshold_bps: u16,
        diversity_target: u32,
        names_program: Pubkey,
        require_premium_for_sellable: bool,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, MinerScoreError::InvalidConfig);
        require!(diversity_target > 0, MinerScoreError::InvalidConfig);
        require!(
            allowlisted_submitters.len() <= MAX_SUBMITTERS,
            MinerScoreError::AllowlistTooLarge
        );
        require!(
            allowlisted_miners.len() <= MAX_MINERS,
            MinerScoreError::AllowlistTooLarge
        );
        require!(
            (alpha_correctness_bps as u32)
                + (alpha_diversity_bps as u32)
                + (alpha_timeliness_bps as u32)
                + (alpha_uptime_bps as u32)
                == 10_000,
            MinerScoreError::InvalidConfig
        );
        require!(
            centralization_penalty_bps as u128 <= BPS_DENOM
                && dominance_threshold_bps as u128 <= BPS_DENOM,
            MinerScoreError::InvalidConfig
        );

        let (expected_vault_auth, bump) =
            Pubkey::find_program_address(&[SEED_VAULT_AUTH], ctx.program_id);
        require_keys_eq!(
            expected_vault_auth,
            ctx.accounts.vault_authority.key(),
            MinerScoreError::InvalidVaultAuthority
        );

        // Create + initialize the reward vault token account (PDA).
        let rent = Rent::get()?;
        let vault_space: u64 = anchor_spl::token::spl_token::state::Account::LEN as u64;
        let vault_lamports = rent.minimum_balance(vault_space as usize);
        let payer_key = ctx.accounts.authority.key();
        let vault_key = ctx.accounts.reward_vault.key();
        let vault_seeds: &[&[u8]] = &[SEED_REWARD_VAULT, &[ctx.bumps.reward_vault]];
        invoke_signed(
            &system_instruction::create_account(
                &payer_key,
                &vault_key,
                vault_lamports,
                vault_space,
                &ctx.accounts.token_program.key(),
            ),
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.reward_vault.to_account_info(),
            ],
            &[vault_seeds],
        )?;

        let init_ix = anchor_spl::token::spl_token::instruction::initialize_account(
            &ctx.accounts.token_program.key(),
            &vault_key,
            &ctx.accounts.toll_mint.key(),
            &expected_vault_auth,
        )?;
        invoke(
            &init_ix,
            &[
                ctx.accounts.reward_vault.to_account_info(),
                ctx.accounts.toll_mint.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.toll_mint = ctx.accounts.toll_mint.key();
        cfg.reward_vault = ctx.accounts.reward_vault.key();
        cfg.vault_authority_bump = bump;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.base_reward_per_epoch = base_reward_per_epoch;
        cfg.per_miner_epoch_cap = per_miner_epoch_cap;
        cfg.min_miner_stake_weight = min_miner_stake_weight;
        cfg.allowlisted_submitters = allowlisted_submitters;
        cfg.allowlisted_miners = allowlisted_miners;
        cfg.alpha_correctness_bps = alpha_correctness_bps;
        cfg.alpha_diversity_bps = alpha_diversity_bps;
        cfg.alpha_timeliness_bps = alpha_timeliness_bps;
        cfg.alpha_uptime_bps = alpha_uptime_bps;
        cfg.centralization_penalty_bps = centralization_penalty_bps;
        cfg.dominance_threshold_bps = dominance_threshold_bps;
        cfg.diversity_target = diversity_target;
        cfg.names_program = names_program;
        cfg.require_premium_for_sellable = require_premium_for_sellable;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn report_miner_epoch_stats(
        ctx: Context<ReportMinerEpochStats>,
        epoch_id: u64,
        miner: Pubkey,
        stake_weight: u64,
        aggregates_submitted: u32,
        unique_name_count: u32,
        unique_receipt_count: u32,
        first_submit_slot: u64,
        last_submit_slot: u64,
        uptime_score: u16,       // 0..10000
        correctness_score: u16,  // 0..10000
        dominance_share_bps: u16, // 0..10000
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(
            is_allowlisted(&cfg.allowlisted_submitters, &ctx.accounts.submitter.key()),
            MinerScoreError::Unauthorized
        );
        require!(
            is_allowlisted(&cfg.allowlisted_miners, &miner),
            MinerScoreError::MinerNotAllowlisted
        );
        require!(
            stake_weight >= cfg.min_miner_stake_weight,
            MinerScoreError::InsufficientStakeWeight
        );
        require!(
            uptime_score as u128 <= SCORE_DENOM && correctness_score as u128 <= SCORE_DENOM,
            MinerScoreError::InvalidScore
        );
        require!(dominance_share_bps as u128 <= BPS_DENOM, MinerScoreError::InvalidConfig);

        let epoch_start_slot = (epoch_id as u128)
            .checked_mul(cfg.epoch_len_slots as u128)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))? as u64;
        let epoch_end_slot = epoch_start_slot.saturating_add(cfg.epoch_len_slots);

        // timeliness_component in 0..10000
        let first = first_submit_slot.max(epoch_start_slot);
        let first_delta = first.saturating_sub(epoch_start_slot);
        let window = cfg.epoch_len_slots.max(1);
        let remaining = window.saturating_sub(first_delta.min(window));
        let timeliness_component: u16 = ((remaining as u128)
            .checked_mul(SCORE_DENOM)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            / (window as u128)) as u16;

        // diversity_component in 0..10000
        let diversity_num: u128 = (unique_name_count as u128)
            .checked_mul(SCORE_DENOM)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            / (cfg.diversity_target as u128);
        let diversity_component: u16 = core::cmp::min(SCORE_DENOM, diversity_num) as u16;

        // Weighted component in 0..10000
        let weighted_sum: u128 = (cfg.alpha_correctness_bps as u128)
            .checked_mul(correctness_score as u128)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            .checked_add(
                (cfg.alpha_uptime_bps as u128)
                    .checked_mul(uptime_score as u128)
                    .ok_or_else(|| error!(MinerScoreError::MathOverflow))?,
            )
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            .checked_add(
                (cfg.alpha_diversity_bps as u128)
                    .checked_mul(diversity_component as u128)
                    .ok_or_else(|| error!(MinerScoreError::MathOverflow))?,
            )
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            .checked_add(
                (cfg.alpha_timeliness_bps as u128)
                    .checked_mul(timeliness_component as u128)
                    .ok_or_else(|| error!(MinerScoreError::MathOverflow))?,
            )
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?;

        let component: u128 = weighted_sum / BPS_DENOM; // 0..10000

        let mut raw_score: u128 = (stake_weight as u128)
            .checked_mul(component)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?;

        if (dominance_share_bps as u128) > (cfg.dominance_threshold_bps as u128) {
            let keep_bps: u128 = BPS_DENOM
                .checked_sub(cfg.centralization_penalty_bps as u128)
                .ok_or_else(|| error!(MinerScoreError::MathOverflow))?;
            raw_score = raw_score
                .checked_mul(keep_bps)
                .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
                / BPS_DENOM;
        }

        let st = &mut ctx.accounts.miner_epoch;
        st.epoch_id = epoch_id;
        st.miner = miner;
        st.stake_weight = stake_weight;
        st.aggregates_submitted = aggregates_submitted;
        st.unique_name_count = unique_name_count;
        st.unique_receipt_count = unique_receipt_count;
        st.first_submit_slot = first_submit_slot;
        st.last_submit_slot = last_submit_slot;
        st.epoch_start_slot = epoch_start_slot;
        st.epoch_end_slot = epoch_end_slot;
        st.uptime_score = uptime_score;
        st.correctness_score = correctness_score;
        st.dominance_share_bps = dominance_share_bps;
        st.diversity_component = diversity_component;
        st.timeliness_component = timeliness_component;
        st.raw_score = raw_score;
        st.submitted_by = ctx.accounts.submitter.key();
        st.submitted_at_slot = Clock::get()?.slot;
        st.bump = ctx.bumps.miner_epoch;
        Ok(())
    }

    pub fn finalize_epoch(
        ctx: Context<FinalizeEpoch>,
        epoch_id: u64,
        total_raw_score: u128,
        total_normalized_score: u128,
        total_rewards_planned: u64,
        miner_count: u32,
        dominance_max_share_bps: u16,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(
            is_allowlisted(&cfg.allowlisted_submitters, &ctx.accounts.submitter.key()),
            MinerScoreError::Unauthorized
        );
        require!(dominance_max_share_bps as u128 <= BPS_DENOM, MinerScoreError::InvalidConfig);

        let t = &mut ctx.accounts.epoch_totals;
        t.epoch_id = epoch_id;
        t.total_raw_score = total_raw_score;
        t.total_normalized_score = total_normalized_score;
        t.total_rewards_planned = total_rewards_planned;
        t.miner_count = miner_count;
        t.dominance_max_share_bps = dominance_max_share_bps;
        t.finalized = true;
        t.bump = ctx.bumps.epoch_totals;
        Ok(())
    }

    pub fn set_miner_reward(
        ctx: Context<SetMinerReward>,
        epoch_id: u64,
        miner: Pubkey,
        normalized_score: u128,
        reward_amount: u64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(
            is_allowlisted(&cfg.allowlisted_submitters, &ctx.accounts.submitter.key()),
            MinerScoreError::Unauthorized
        );
        require!(ctx.accounts.epoch_totals.finalized, MinerScoreError::EpochNotFinalized);
        require!(reward_amount <= cfg.per_miner_epoch_cap, MinerScoreError::RewardCapExceeded);

        // stats must exist for this epoch/miner (reported earlier).
        require!(ctx.accounts.miner_epoch.epoch_id == epoch_id, MinerScoreError::EpochMismatch);
        require_keys_eq!(ctx.accounts.miner_epoch.miner, miner, MinerScoreError::MinerMismatch);
        require!(!ctx.accounts.miner_epoch.claimed, MinerScoreError::AlreadyClaimed);

        let st = &mut ctx.accounts.miner_epoch;
        st.normalized_score = normalized_score;
        st.reward_amount = reward_amount;
        Ok(())
    }

    pub fn claim_miner_reward(ctx: Context<ClaimMinerReward>, epoch_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(ctx.accounts.miner_epoch.epoch_id == epoch_id, MinerScoreError::EpochMismatch);
        require_keys_eq!(
            ctx.accounts.miner_epoch.miner,
            ctx.accounts.miner.key(),
            MinerScoreError::MinerMismatch
        );
        require!(!ctx.accounts.miner_epoch.claimed, MinerScoreError::AlreadyClaimed);
        require!(ctx.accounts.miner_epoch.reward_amount > 0, MinerScoreError::NoReward);

        // Validate vault + destination token accounts (SPL Token, correct mint/owner).
        require_keys_eq!(
            ctx.accounts.reward_vault.key(),
            cfg.reward_vault,
            MinerScoreError::InvalidVault
        );
        validate_token_account_mint_owner(
            &ctx.accounts.reward_vault,
            &cfg.toll_mint,
            &ctx.accounts.vault_authority.key(),
        )?;
        validate_token_account_mint_owner(
            &ctx.accounts.miner_ata,
            &cfg.toll_mint,
            &ctx.accounts.miner.key(),
        )?;

        if cfg.require_premium_for_sellable {
            require_keys_eq!(
                ctx.accounts.names_program.key(),
                cfg.names_program,
                MinerScoreError::InvalidNamesProgram
            );
            verify_premium_name_account(
                &ctx.accounts.premium_name,
                &ctx.accounts.miner.key(),
                &ctx.accounts.names_program.key(),
            )?;
        }

        let signer_seeds: &[&[u8]] = &[SEED_VAULT_AUTH, &[cfg.vault_authority_bump]];
        token::transfer(
            ctx.accounts
                .transfer_to_miner_ctx()
                .with_signer(&[signer_seeds]),
            ctx.accounts.miner_epoch.reward_amount,
        )?;

        let st = &mut ctx.accounts.miner_epoch;
        st.claimed = true;

        let cr = &mut ctx.accounts.claim_receipt;
        cr.epoch_id = epoch_id;
        cr.miner = ctx.accounts.miner.key();
        cr.amount = st.reward_amount;
        cr.claimed_at_slot = Clock::get()?.slot;
        cr.bump = ctx.bumps.claim_receipt;

        Ok(())
    }

    pub fn penalize_miner(
        ctx: Context<PenalizeMiner>,
        epoch_id: u64,
        miner: Pubkey,
        penalty_bps: u16,
        reason_hash: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(
            is_allowlisted(&cfg.allowlisted_submitters, &ctx.accounts.submitter.key()),
            MinerScoreError::Unauthorized
        );
        require!(penalty_bps as u128 <= BPS_DENOM, MinerScoreError::InvalidConfig);
        require!(ctx.accounts.miner_epoch.epoch_id == epoch_id, MinerScoreError::EpochMismatch);
        require_keys_eq!(ctx.accounts.miner_epoch.miner, miner, MinerScoreError::MinerMismatch);
        require!(!ctx.accounts.miner_epoch.claimed, MinerScoreError::AlreadyClaimed);

        let keep_bps: u128 = BPS_DENOM
            .checked_sub(penalty_bps as u128)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?;

        let st = &mut ctx.accounts.miner_epoch;
        st.correctness_score = ((st.correctness_score as u128)
            .checked_mul(keep_bps)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            / BPS_DENOM) as u16;

        // Simple proportional reduction of reward/normalized/raw. (End-state: recompute from proofs.)
        st.raw_score = (st.raw_score
            .checked_mul(keep_bps)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?)
            / BPS_DENOM;
        st.normalized_score = (st.normalized_score
            .checked_mul(keep_bps)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?)
            / BPS_DENOM;
        st.reward_amount = (st.reward_amount as u128)
            .checked_mul(keep_bps)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))?
            .checked_div(BPS_DENOM)
            .ok_or_else(|| error!(MinerScoreError::MathOverflow))? as u64;

        emit!(MinerPenalized {
            epoch_id,
            miner,
            penalty_bps,
            reason_hash,
            new_reward_amount: st.reward_amount,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitMinerScoreConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + MinerScoreConfig::SIZE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, MinerScoreConfig>,

    #[account(seeds = [SEED_VAULT_AUTH], bump)]
    /// CHECK: PDA authority for reward_vault.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: validated by SPL token initialize; must be an SPL mint.
    pub toll_mint: UncheckedAccount<'info>,

    /// CHECK: PDA token account created + initialized in handler.
    #[account(mut, seeds = [SEED_REWARD_VAULT], bump)]
    pub reward_vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, miner: Pubkey)]
pub struct ReportMinerEpochStats<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, MinerScoreConfig>,

    #[account(
        init,
        payer = submitter,
        space = 8 + MinerEpochStats::SIZE,
        seeds = [SEED_MINER_EPOCH, epoch_id.to_le_bytes().as_ref(), miner.as_ref()],
        bump
    )]
    pub miner_epoch: Account<'info, MinerEpochStats>,

    #[account(mut)]
    pub submitter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct FinalizeEpoch<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, MinerScoreConfig>,

    #[account(
        init,
        payer = submitter,
        space = 8 + EpochTotals::SIZE,
        seeds = [SEED_EPOCH_TOTALS, epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_totals: Account<'info, EpochTotals>,

    #[account(mut)]
    pub submitter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, miner: Pubkey)]
pub struct SetMinerReward<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, MinerScoreConfig>,

    #[account(seeds = [SEED_EPOCH_TOTALS, epoch_id.to_le_bytes().as_ref()], bump = epoch_totals.bump)]
    pub epoch_totals: Account<'info, EpochTotals>,

    #[account(
        mut,
        seeds = [SEED_MINER_EPOCH, epoch_id.to_le_bytes().as_ref(), miner.as_ref()],
        bump = miner_epoch.bump
    )]
    pub miner_epoch: Account<'info, MinerEpochStats>,

    pub submitter: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct ClaimMinerReward<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, MinerScoreConfig>,

    #[account(seeds = [SEED_VAULT_AUTH], bump = config.vault_authority_bump)]
    /// CHECK: PDA authority for reward_vault.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: validated in handler.
    #[account(mut, address = config.reward_vault)]
    pub reward_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SEED_MINER_EPOCH, epoch_id.to_le_bytes().as_ref(), miner.key().as_ref()],
        bump = miner_epoch.bump
    )]
    pub miner_epoch: Account<'info, MinerEpochStats>,

    #[account(mut)]
    pub miner: Signer<'info>,

    #[account(mut)]
    /// CHECK: validated in handler.
    pub miner_ata: UncheckedAccount<'info>,

    /// CHECK: validated against config.names_program in handler.
    pub names_program: UncheckedAccount<'info>,

    /// CHECK: validated and parsed in handler as ddns_names::PremiumName account.
    pub premium_name: UncheckedAccount<'info>,

    #[account(
        init,
        payer = miner,
        space = 8 + MinerClaimReceipt::SIZE,
        seeds = [SEED_CLAIM, epoch_id.to_le_bytes().as_ref(), miner.key().as_ref()],
        bump
    )]
    pub claim_receipt: Account<'info, MinerClaimReceipt>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> ClaimMinerReward<'info> {
    fn transfer_to_miner_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reward_vault.to_account_info(),
                to: self.miner_ata.to_account_info(),
                authority: self.vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, miner: Pubkey)]
pub struct PenalizeMiner<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, MinerScoreConfig>,

    #[account(
        mut,
        seeds = [SEED_MINER_EPOCH, epoch_id.to_le_bytes().as_ref(), miner.as_ref()],
        bump = miner_epoch.bump
    )]
    pub miner_epoch: Account<'info, MinerEpochStats>,

    pub submitter: Signer<'info>,
}

#[account]
pub struct MinerScoreConfig {
    pub authority: Pubkey,
    pub toll_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub vault_authority_bump: u8,
    pub epoch_len_slots: u64,
    pub base_reward_per_epoch: u64,
    pub per_miner_epoch_cap: u64,
    pub min_miner_stake_weight: u64,
    pub allowlisted_submitters: Vec<Pubkey>,
    pub allowlisted_miners: Vec<Pubkey>,
    pub alpha_correctness_bps: u16,
    pub alpha_diversity_bps: u16,
    pub alpha_timeliness_bps: u16,
    pub alpha_uptime_bps: u16,
    pub centralization_penalty_bps: u16,
    pub dominance_threshold_bps: u16,
    pub diversity_target: u32,
    pub names_program: Pubkey,
    pub require_premium_for_sellable: bool,
    pub bump: u8,
}

impl MinerScoreConfig {
    pub const SIZE: usize =
        32  // authority
        + 32 // toll_mint
        + 32 // reward_vault
        + 1  // vault_authority_bump
        + 8  // epoch_len_slots
        + 8  // base_reward_per_epoch
        + 8  // per_miner_epoch_cap
        + 8  // min_miner_stake_weight
        + 4 + 32 * MAX_SUBMITTERS // allowlisted_submitters vec
        + 4 + 32 * MAX_MINERS     // allowlisted_miners vec
        + 2*6 // u16 scoring params (4 alphas + penalty + threshold)
        + 4  // diversity_target
        + 32 // names_program
        + 1  // require_premium_for_sellable
        + 1; // bump
}

#[account]
pub struct MinerEpochStats {
    pub epoch_id: u64,
    pub miner: Pubkey,
    pub stake_weight: u64,
    pub aggregates_submitted: u32,
    pub unique_name_count: u32,
    pub unique_receipt_count: u32,
    pub first_submit_slot: u64,
    pub last_submit_slot: u64,
    pub epoch_start_slot: u64,
    pub epoch_end_slot: u64,
    pub uptime_score: u16,
    pub correctness_score: u16,
    pub dominance_share_bps: u16,
    pub diversity_component: u16,
    pub timeliness_component: u16,
    pub raw_score: u128,
    pub normalized_score: u128,
    pub reward_amount: u64,
    pub claimed: bool,
    pub submitted_by: Pubkey,
    pub submitted_at_slot: u64,
    pub bump: u8,
}

impl MinerEpochStats {
    pub const SIZE: usize =
        8 + 32 + 8 + 4 + 4 + 4 + 8 + 8 + 8 + 8 + 2 + 2 + 2 + 2 + 2 + 16 + 16 + 8 + 1 + 32 + 8 + 1;
}

#[account]
pub struct EpochTotals {
    pub epoch_id: u64,
    pub total_raw_score: u128,
    pub total_normalized_score: u128,
    pub total_rewards_planned: u64,
    pub miner_count: u32,
    pub dominance_max_share_bps: u16,
    pub finalized: bool,
    pub bump: u8,
}

impl EpochTotals {
    pub const SIZE: usize = 8 + 16 + 16 + 8 + 4 + 2 + 1 + 1;
}

#[account]
pub struct MinerClaimReceipt {
    pub epoch_id: u64,
    pub miner: Pubkey,
    pub amount: u64,
    pub claimed_at_slot: u64,
    pub bump: u8,
}

impl MinerClaimReceipt {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1;
}

#[event]
pub struct MinerPenalized {
    pub epoch_id: u64,
    pub miner: Pubkey,
    pub penalty_bps: u16,
    pub reason_hash: [u8; 32],
    pub new_reward_amount: u64,
}

fn is_allowlisted(list: &[Pubkey], k: &Pubkey) -> bool {
    list.iter().any(|x| x == k)
}

fn premium_name_discriminator() -> [u8; 8] {
    let digest = Sha256::digest(format!("account:{}", PREMIUM_NAME_ACCOUNT).as_bytes());
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

fn verify_premium_name_account(
    premium_name: &UncheckedAccount,
    expected_owner: &Pubkey,
    expected_program: &Pubkey,
) -> Result<()> {
    let info = premium_name.to_account_info();
    require_keys_eq!(*info.owner, *expected_program, MinerScoreError::InvalidNamesProgram);
    let data = info.try_borrow_data()?;
    require!(data.len() >= 8 + 32 + 32, MinerScoreError::InvalidPremiumName);
    let disc = premium_name_discriminator();
    require!(data[..8] == disc, MinerScoreError::InvalidPremiumName);
    let owner = Pubkey::new_from_array(
        data[8 + 32..8 + 32 + 32]
            .try_into()
            .map_err(|_| error!(MinerScoreError::InvalidPremiumName))?,
    );
    require_keys_eq!(owner, *expected_owner, MinerScoreError::PremiumRequired);
    Ok(())
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
        MinerScoreError::InvalidTokenAccount
    );
    let data = info.try_borrow_data()?;
    let parsed = anchor_spl::token::spl_token::state::Account::unpack(&data)
        .map_err(|_| error!(MinerScoreError::InvalidTokenAccount))?;
    require_keys_eq!(parsed.mint, *expected_mint, MinerScoreError::InvalidMint);
    require_keys_eq!(parsed.owner, *expected_owner, MinerScoreError::InvalidTokenOwner);
    Ok(())
}

#[error_code]
pub enum MinerScoreError {
    #[msg("unauthorized")]
    Unauthorized,
    #[msg("invalid config")]
    InvalidConfig,
    #[msg("allowlist too large")]
    AllowlistTooLarge,
    #[msg("invalid vault authority PDA")]
    InvalidVaultAuthority,
    #[msg("miner not allowlisted (MVP gating)")]
    MinerNotAllowlisted,
    #[msg("insufficient stake weight")]
    InsufficientStakeWeight,
    #[msg("invalid score")]
    InvalidScore,
    #[msg("epoch not finalized")]
    EpochNotFinalized,
    #[msg("reward exceeds per-miner cap")]
    RewardCapExceeded,
    #[msg("already claimed")]
    AlreadyClaimed,
    #[msg("no reward")]
    NoReward,
    #[msg("invalid reward vault")]
    InvalidVault,
    #[msg("invalid mint")]
    InvalidMint,
    #[msg("invalid token account")]
    InvalidTokenAccount,
    #[msg("invalid token owner")]
    InvalidTokenOwner,
    #[msg("epoch mismatch")]
    EpochMismatch,
    #[msg("miner mismatch")]
    MinerMismatch,
    #[msg("math overflow")]
    MathOverflow,
    #[msg("invalid names program account")]
    InvalidNamesProgram,
    #[msg("premium .dns required for sellable rewards")]
    PremiumRequired,
    #[msg("invalid premium name account")]
    InvalidPremiumName,
}
