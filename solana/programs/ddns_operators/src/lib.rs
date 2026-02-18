use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::{self, Token, Transfer};
use spl_token::state::Account as SplTokenAccount;

declare_id!("3Q5VCoAT4TZ9xMrpbt4jbN9LhHfihxGH3TiD6PmSqHhp");

const MAX_METRICS_SUBMITTERS: usize = 64;
const MAX_SLASH_AUTHORITIES: usize = 32;
const MAX_ENDPOINTS: usize = 8;

#[program]
pub mod ddns_operators {
    use super::*;

    pub fn init_operators_config(
        ctx: Context<InitOperatorsConfig>,
        epoch_len_slots: u64,
        min_operator_stake_lamports: u64,
        max_endpoints_per_operator: u8,
        reward_per_paid_query: u64,
        reward_per_verified_receipt: u64,
        uptime_bonus_per_10k: u64,
        latency_bonus_threshold_ms: u32,
        latency_bonus: u64,
        max_rewards_per_epoch: u64,
        metrics_submitters: Vec<Pubkey>,
        slashing_authorities: Vec<Pubkey>,
        enabled: bool,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, OperatorsError::BadEpochLen);
        require!(
            max_endpoints_per_operator as usize <= MAX_ENDPOINTS,
            OperatorsError::BadMaxEndpoints
        );
        require!(
            metrics_submitters.len() <= MAX_METRICS_SUBMITTERS,
            OperatorsError::TooManySubmitters
        );
        require!(
            slashing_authorities.len() <= MAX_SLASH_AUTHORITIES,
            OperatorsError::TooManySlashAuthorities
        );

        // Create the treasury_authority PDA as a 0-data system account so it can sign SPL token transfers.
        require!(
            ctx.accounts.treasury_authority.data_is_empty()
                && ctx.accounts.treasury_authority.lamports() == 0,
            OperatorsError::TreasuryAuthorityAlreadyExists
        );
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(0);
        let auth_seeds: &[&[u8]] = &[b"treasury_authority", &[ctx.bumps.treasury_authority]];
        let signer_seeds: &[&[&[u8]]] = &[auth_seeds];
        let create_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.treasury_authority.key(),
            lamports,
            0,
            &anchor_lang::solana_program::system_program::ID,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.treasury_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Create + initialize the treasury_vault SPL token account (owned by SPL Token program).
        require!(
            ctx.accounts.treasury_vault.data_is_empty() && ctx.accounts.treasury_vault.lamports() == 0,
            OperatorsError::TreasuryVaultAlreadyExists
        );
        require!(
            *ctx.accounts.toll_mint.owner == ctx.accounts.token_program.key(),
            OperatorsError::BadMintOwner
        );

        let vault_lamports = rent.minimum_balance(SplTokenAccount::LEN);
        let create_vault_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.treasury_vault.key(),
            vault_lamports,
            SplTokenAccount::LEN as u64,
            &ctx.accounts.token_program.key(),
        );
        anchor_lang::solana_program::program::invoke(
            &create_vault_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.treasury_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let init_vault_ix = spl_token::instruction::initialize_account3(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.treasury_vault.key(),
            &ctx.accounts.toll_mint.key(),
            &ctx.accounts.treasury_authority.key(),
        )?;
        anchor_lang::solana_program::program::invoke(
            &init_vault_ix,
            &[
                ctx.accounts.treasury_vault.to_account_info(),
                ctx.accounts.toll_mint.to_account_info(),
            ],
        )?;

        let cfg = &mut ctx.accounts.operators_config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.toll_mint = ctx.accounts.toll_mint.key();
        cfg.treasury_vault = ctx.accounts.treasury_vault.key();
        cfg.treasury_authority_bump = ctx.bumps.treasury_authority;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.min_operator_stake_lamports = min_operator_stake_lamports;
        cfg.max_endpoints_per_operator = max_endpoints_per_operator;
        cfg.reward_per_paid_query = reward_per_paid_query;
        cfg.reward_per_verified_receipt = reward_per_verified_receipt;
        cfg.uptime_bonus_per_10k = uptime_bonus_per_10k;
        cfg.latency_bonus_threshold_ms = latency_bonus_threshold_ms;
        cfg.latency_bonus = latency_bonus;
        cfg.max_rewards_per_epoch = max_rewards_per_epoch;
        cfg.metrics_submitters = metrics_submitters;
        cfg.slashing_authorities = slashing_authorities;
        cfg.enabled = enabled;
        cfg.bump = ctx.bumps.operators_config;
        Ok(())
    }

    pub fn update_operators_config(
        ctx: Context<UpdateOperatorsConfig>,
        epoch_len_slots: u64,
        min_operator_stake_lamports: u64,
        max_endpoints_per_operator: u8,
        reward_per_paid_query: u64,
        reward_per_verified_receipt: u64,
        uptime_bonus_per_10k: u64,
        latency_bonus_threshold_ms: u32,
        latency_bonus: u64,
        max_rewards_per_epoch: u64,
        metrics_submitters: Vec<Pubkey>,
        slashing_authorities: Vec<Pubkey>,
        enabled: bool,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, OperatorsError::BadEpochLen);
        require!(
            max_endpoints_per_operator as usize <= MAX_ENDPOINTS,
            OperatorsError::BadMaxEndpoints
        );
        require!(
            metrics_submitters.len() <= MAX_METRICS_SUBMITTERS,
            OperatorsError::TooManySubmitters
        );
        require!(
            slashing_authorities.len() <= MAX_SLASH_AUTHORITIES,
            OperatorsError::TooManySlashAuthorities
        );

        let cfg = &mut ctx.accounts.operators_config;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.min_operator_stake_lamports = min_operator_stake_lamports;
        cfg.max_endpoints_per_operator = max_endpoints_per_operator;
        cfg.reward_per_paid_query = reward_per_paid_query;
        cfg.reward_per_verified_receipt = reward_per_verified_receipt;
        cfg.uptime_bonus_per_10k = uptime_bonus_per_10k;
        cfg.latency_bonus_threshold_ms = latency_bonus_threshold_ms;
        cfg.latency_bonus = latency_bonus;
        cfg.max_rewards_per_epoch = max_rewards_per_epoch;
        cfg.metrics_submitters = metrics_submitters;
        cfg.slashing_authorities = slashing_authorities;
        cfg.enabled = enabled;
        Ok(())
    }

    pub fn register_operator(
        ctx: Context<RegisterOperator>,
        kind: u8,
        endpoints: Vec<Endpoint>,
        payout_token_account: Pubkey,
    ) -> Result<()> {
        let cfg = &ctx.accounts.operators_config;
        require!(
            endpoints.len() <= cfg.max_endpoints_per_operator as usize,
            OperatorsError::TooManyEndpoints
        );

        // Create the operator_vault PDA as a 0-data system account for SOL stake custody.
        require!(
            ctx.accounts.operator_vault.data_is_empty() && ctx.accounts.operator_vault.lamports() == 0,
            OperatorsError::VaultAlreadyExists
        );
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(0);
        let operator_wallet_key = ctx.accounts.operator_wallet.key();
        let vault_seeds: &[&[u8]] = &[
            b"operator_vault",
            operator_wallet_key.as_ref(),
            &[ctx.bumps.operator_vault],
        ];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
        let create_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.operator_wallet.key(),
            &ctx.accounts.operator_vault.key(),
            lamports,
            0,
            &anchor_lang::solana_program::system_program::ID,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_ix,
            &[
                ctx.accounts.operator_wallet.to_account_info(),
                ctx.accounts.operator_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        let op = &mut ctx.accounts.operator;
        op.operator_wallet = ctx.accounts.operator_wallet.key();
        op.kind = kind;
        op.status = OperatorStatus::Paused as u8;
        op.stake_amount_lamports = 0;
        op.payout_token_account = payout_token_account;
        op.endpoint_count = endpoints.len() as u8;
        op.endpoints = [Endpoint::default(); MAX_ENDPOINTS];
        for (i, ep) in endpoints.into_iter().enumerate() {
            op.endpoints[i] = ep;
        }
        op.last_claimed_epoch = 0;
        op.bump = ctx.bumps.operator;
        op.vault_bump = ctx.bumps.operator_vault;
        Ok(())
    }

    pub fn update_endpoints(ctx: Context<UpdateEndpoints>, endpoints: Vec<Endpoint>) -> Result<()> {
        let cfg = &ctx.accounts.operators_config;
        require!(
            endpoints.len() <= cfg.max_endpoints_per_operator as usize,
            OperatorsError::TooManyEndpoints
        );
        require!(ctx.accounts.operator.status != OperatorStatus::Slashed as u8, OperatorsError::OperatorSlashed);

        let op = &mut ctx.accounts.operator;
        op.endpoint_count = endpoints.len() as u8;
        op.endpoints = [Endpoint::default(); MAX_ENDPOINTS];
        for (i, ep) in endpoints.into_iter().enumerate() {
            op.endpoints[i] = ep;
        }
        Ok(())
    }

    pub fn pause_operator(ctx: Context<OperatorSelf>) -> Result<()> {
        ctx.accounts.operator.status = OperatorStatus::Paused as u8;
        Ok(())
    }

    pub fn resume_operator(ctx: Context<OperatorSelf>) -> Result<()> {
        let cfg = &ctx.accounts.operators_config;
        require!(ctx.accounts.operator.stake_amount_lamports >= cfg.min_operator_stake_lamports, OperatorsError::InsufficientStake);
        require!(ctx.accounts.operator.status != OperatorStatus::Slashed as u8, OperatorsError::OperatorSlashed);
        ctx.accounts.operator.status = OperatorStatus::Active as u8;
        Ok(())
    }

    pub fn stake_operator(ctx: Context<StakeOperator>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, OperatorsError::BadAmount);
        require!(ctx.accounts.operator.status != OperatorStatus::Slashed as u8, OperatorsError::OperatorSlashed);

        let cfg = &ctx.accounts.operators_config;
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.operator_wallet.key(),
            &ctx.accounts.operator_vault.key(),
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.operator_wallet.to_account_info(),
                ctx.accounts.operator_vault.to_account_info(),
            ],
        )?;

        let op = &mut ctx.accounts.operator;
        op.stake_amount_lamports = op
            .stake_amount_lamports
            .checked_add(amount_lamports)
            .ok_or(OperatorsError::Overflow)?;

        // Auto-activate once stake meets minimum (MVP convenience).
        if op.stake_amount_lamports >= cfg.min_operator_stake_lamports
            && op.status == OperatorStatus::Paused as u8
        {
            op.status = OperatorStatus::Active as u8;
        }

        Ok(())
    }

    pub fn unstake_operator(ctx: Context<UnstakeOperator>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, OperatorsError::BadAmount);
        require!(ctx.accounts.operator.status != OperatorStatus::Slashed as u8, OperatorsError::OperatorSlashed);

        let op = &mut ctx.accounts.operator;
        require!(op.stake_amount_lamports >= amount_lamports, OperatorsError::InsufficientStake);

        op.stake_amount_lamports = op
            .stake_amount_lamports
            .checked_sub(amount_lamports)
            .ok_or(OperatorsError::Overflow)?;

        // If stake drops below minimum, pause.
        if op.stake_amount_lamports < ctx.accounts.operators_config.min_operator_stake_lamports {
            op.status = OperatorStatus::Paused as u8;
        }

        let operator_wallet_key = ctx.accounts.operator_wallet.key();
        let vault_seeds: &[&[u8]] = &[
            b"operator_vault",
            operator_wallet_key.as_ref(),
            &[op.vault_bump],
        ];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.operator_vault.key(),
            &ctx.accounts.operator_wallet.key(),
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.operator_vault.to_account_info(),
                ctx.accounts.operator_wallet.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        Ok(())
    }

    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, OperatorsError::BadAmount);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.operators_config.authority,
            OperatorsError::Unauthorized
        );

        let cfg = &ctx.accounts.operators_config;
        require!(ctx.accounts.treasury_vault.key() == cfg.treasury_vault, OperatorsError::BadTreasuryVault);

        let authority_ata = read_spl_token_account(
            &ctx.accounts.authority_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(authority_ata.mint == cfg.toll_mint, OperatorsError::BadMint);
        require!(authority_ata.owner == ctx.accounts.authority.key(), OperatorsError::BadPayerAtaOwner);

        let vault_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(vault_ata.mint == cfg.toll_mint, OperatorsError::BadMint);
        let (ta, _) = Pubkey::find_program_address(&[b"treasury_authority"], ctx.program_id);
        require!(vault_ata.owner == ta, OperatorsError::BadTreasuryVaultOwner);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority_toll_ata.to_account_info(),
                to: ctx.accounts.treasury_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn submit_epoch_metrics(
        ctx: Context<SubmitEpochMetrics>,
        epoch_id: u64,
        paid_query_count: u64,
        receipt_count: u64,
        uptime_score: u16,
        latency_ms_p50: u32,
        metrics_root: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.operators_config;
        require!(cfg.enabled, OperatorsError::Disabled);
        require_is_metrics_submitter(cfg, &ctx.accounts.submitter.key())?;

        let slot = Clock::get()?.slot;
        let got_epoch = epoch_id_from_slot(slot, cfg.epoch_len_slots)?;
        require!(got_epoch == epoch_id, OperatorsError::WrongEpoch);

        let m = &mut ctx.accounts.epoch_metrics;
        if m.submitted_at_slot != 0 && m.submitted_by != ctx.accounts.submitter.key() {
            return err!(OperatorsError::MetricsAlreadySubmitted);
        }

        m.epoch_id = epoch_id;
        m.operator_wallet = ctx.accounts.operator.operator_wallet;
        m.paid_query_count = paid_query_count;
        m.receipt_count = receipt_count;
        m.uptime_score = uptime_score;
        m.latency_ms_p50 = latency_ms_p50;
        m.metrics_root = metrics_root;
        m.submitted_by = ctx.accounts.submitter.key();
        m.submitted_at_slot = slot;
        m.bump = ctx.bumps.epoch_metrics;
        Ok(())
    }

    pub fn claim_operator_rewards(ctx: Context<ClaimOperatorRewards>, epoch_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.operators_config;
        require!(cfg.enabled, OperatorsError::Disabled);

        require!(ctx.accounts.operator.status == OperatorStatus::Active as u8, OperatorsError::OperatorNotActive);

        let m = &mut ctx.accounts.epoch_metrics;
        require!(m.epoch_id == epoch_id, OperatorsError::WrongEpoch);
        require!(m.operator_wallet == ctx.accounts.operator.operator_wallet, OperatorsError::MetricsMismatch);
        require!(m.rewarded_amount == 0, OperatorsError::AlreadyRewarded);

        // Reward is primarily based on demand:
        // - paid_query_count is miner-verified in MVP (off-chain receipts/tolls)
        // - receipt_count (verified witness receipts) can be rewarded lightly
        let mut reward = (m.paid_query_count as u128)
            .checked_mul(cfg.reward_per_paid_query as u128)
            .ok_or(OperatorsError::Overflow)?;
        reward = reward
            .checked_add(
                (m.receipt_count as u128)
                    .checked_mul(cfg.reward_per_verified_receipt as u128)
                    .ok_or(OperatorsError::Overflow)?,
            )
            .ok_or(OperatorsError::Overflow)?;

        // Performance bonuses (bounded):
        // - uptime_score is 0..10000
        let uptime_bonus = (m.uptime_score as u128)
            .checked_mul(cfg.uptime_bonus_per_10k as u128)
            .ok_or(OperatorsError::Overflow)?
            / 10_000u128;
        reward = reward.checked_add(uptime_bonus).ok_or(OperatorsError::Overflow)?;

        if cfg.latency_bonus > 0 && m.latency_ms_p50 > 0 && m.latency_ms_p50 <= cfg.latency_bonus_threshold_ms {
            reward = reward.checked_add(cfg.latency_bonus as u128).ok_or(OperatorsError::Overflow)?;
        }

        let reward_u64 = (reward as u64).min(cfg.max_rewards_per_epoch);
        require!(reward_u64 > 0, OperatorsError::NothingToClaim);

        require!(ctx.accounts.treasury_vault.key() == cfg.treasury_vault, OperatorsError::BadTreasuryVault);

        // Validate treasury vault is controlled by PDA.
        let vault_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(vault_ata.mint == cfg.toll_mint, OperatorsError::BadMint);
        require!(vault_ata.owner == ctx.accounts.treasury_authority.key(), OperatorsError::BadTreasuryVaultOwner);

        // Validate operator payout account matches operator record.
        require_keys_eq!(
            ctx.accounts.operator.payout_token_account,
            ctx.accounts.operator_payout_ata.key(),
            OperatorsError::PayoutAtaMismatch
        );
        let payout_ata = read_spl_token_account(
            &ctx.accounts.operator_payout_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(payout_ata.mint == cfg.toll_mint, OperatorsError::BadMint);

        let auth_seeds: &[&[u8]] = &[b"treasury_authority", &[cfg.treasury_authority_bump]];
        let signer_seeds: &[&[&[u8]]] = &[auth_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.operator_payout_ata.to_account_info(),
                authority: ctx.accounts.treasury_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, reward_u64)?;

        m.rewarded_amount = reward_u64;
        m.rewarded_at_slot = Clock::get()?.slot;

        ctx.accounts.operator.last_claimed_epoch = epoch_id;
        Ok(())
    }

    // MVP: a domain owner wallet sets delegation for a `.dns` name_hash.
    // This does not prove ICANN control; that is handled by ddns_rewards in the domain-claim module.
    pub fn set_domain_ns_operator(
        ctx: Context<SetDomainNsOperator>,
        name_hash: [u8; 32],
        operator_wallet: Pubkey,
        enabled: bool,
    ) -> Result<()> {
        let d = &mut ctx.accounts.domain_ns_delegation;
        if d.created_at_slot == 0 {
            d.name_hash = name_hash;
            d.owner_wallet = ctx.accounts.owner.key();
            d.bump = ctx.bumps.domain_ns_delegation;
            d.created_at_slot = Clock::get()?.slot;
        } else {
            require_keys_eq!(d.owner_wallet, ctx.accounts.owner.key(), OperatorsError::OwnerMismatch);
        }

        d.operator_wallet = operator_wallet;
        d.enabled = enabled;
        d.updated_at_slot = Clock::get()?.slot;
        Ok(())
    }

    // MVP: authority or allowlisted slashing authorities can slash operator stake and/or pause them.
    pub fn slash_operator(
        ctx: Context<SlashOperator>,
        slash_bps: u16,
        reason_code: u16,
    ) -> Result<()> {
        require!(slash_bps <= 10_000, OperatorsError::BadBps);
        let cfg = &ctx.accounts.operators_config;

        let signer = ctx.accounts.signer.key();
        let is_authority = signer == cfg.authority;
        let is_allowlisted = cfg.slashing_authorities.iter().any(|k| *k == signer);
        require!(is_authority || is_allowlisted, OperatorsError::Unauthorized);

        let op = &mut ctx.accounts.operator;
        require!(op.status != OperatorStatus::Slashed as u8, OperatorsError::OperatorSlashed);

        let slash_amount = ((op.stake_amount_lamports as u128)
            .checked_mul(slash_bps as u128)
            .ok_or(OperatorsError::Overflow)?
            / 10_000u128) as u64;

        if slash_amount > 0 {
            // Transfer SOL from operator vault PDA to authority as penalty.
            let vault_seeds: &[&[u8]] = &[
                b"operator_vault",
                op.operator_wallet.as_ref(),
                &[op.vault_bump],
            ];
            let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

            let ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.operator_vault.key(),
                &cfg.authority,
                slash_amount,
            );
            anchor_lang::solana_program::program::invoke_signed(
                &ix,
                &[
                    ctx.accounts.operator_vault.to_account_info(),
                    ctx.accounts.authority_destination.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;

            op.stake_amount_lamports = op
                .stake_amount_lamports
                .checked_sub(slash_amount)
                .ok_or(OperatorsError::Overflow)?;
        }

        // For MVP: any slash pauses the operator; large slashes mark slashed.
        if slash_bps >= 5000 || reason_code != 0 {
            op.status = OperatorStatus::Slashed as u8;
        } else {
            op.status = OperatorStatus::Paused as u8;
        }
        Ok(())
    }
}

fn epoch_id_from_slot(slot: u64, epoch_len_slots: u64) -> Result<u64> {
    require!(epoch_len_slots > 0, OperatorsError::BadEpochLen);
    Ok(slot / epoch_len_slots)
}

fn require_is_metrics_submitter(cfg: &OperatorsConfig, key: &Pubkey) -> Result<()> {
    require!(
        cfg.metrics_submitters.iter().any(|k| k == key) || cfg.authority == *key,
        OperatorsError::NotSubmitter
    );
    Ok(())
}

fn read_spl_token_account(ai: &AccountInfo, token_program: &Pubkey) -> Result<SplTokenAccount> {
    require!(*ai.owner == *token_program, OperatorsError::BadTokenAccountOwner);
    let data = ai.try_borrow_data()?;
    SplTokenAccount::unpack(&data).map_err(|_| error!(OperatorsError::BadTokenAccountData))
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq)]
pub struct Endpoint {
    pub endpoint_kind: u8, // 0=DoH URL hash, 1=IPv4, 2=IPv6, 3=DNSName hash
    pub value: [u8; 32],
    pub region: u16, // 0 means unknown
}

#[repr(u8)]
pub enum OperatorStatus {
    Active = 1,
    Paused = 2,
    Slashed = 3,
}

#[account]
pub struct OperatorsConfig {
    pub authority: Pubkey,
    pub toll_mint: Pubkey,
    pub treasury_vault: Pubkey,
    pub treasury_authority_bump: u8,
    pub epoch_len_slots: u64,
    pub min_operator_stake_lamports: u64,
    pub max_endpoints_per_operator: u8,

    pub reward_per_paid_query: u64,
    pub reward_per_verified_receipt: u64,
    pub uptime_bonus_per_10k: u64,
    pub latency_bonus_threshold_ms: u32,
    pub latency_bonus: u64,
    pub max_rewards_per_epoch: u64,

    pub metrics_submitters: Vec<Pubkey>,
    pub slashing_authorities: Vec<Pubkey>,
    pub enabled: bool,
    pub bump: u8,
}

impl OperatorsConfig {
    pub const SIZE: usize = 32
        + 32
        + 32
        + 1
        + 8
        + 8
        + 1
        + 8
        + 8
        + 8
        + 4
        + 8
        + 8
        + 4
        + (32 * MAX_METRICS_SUBMITTERS)
        + 4
        + (32 * MAX_SLASH_AUTHORITIES)
        + 1
        + 1;
}

#[account]
pub struct Operator {
    pub operator_wallet: Pubkey,
    pub kind: u8, // 0=DoH, 1=AuthoritativeNS, 2=Both
    pub status: u8,
    pub stake_amount_lamports: u64,
    pub payout_token_account: Pubkey,
    pub endpoint_count: u8,
    pub endpoints: [Endpoint; MAX_ENDPOINTS],
    pub last_claimed_epoch: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Operator {
    pub const SIZE: usize = 32 + 1 + 1 + 8 + 32 + 1 + (MAX_ENDPOINTS * (1 + 32 + 2)) + 8 + 1 + 1;
}

#[account]
pub struct EpochMetrics {
    pub epoch_id: u64,
    pub operator_wallet: Pubkey,
    pub paid_query_count: u64,
    pub receipt_count: u64,
    pub uptime_score: u16, // 0..10000
    pub latency_ms_p50: u32,
    pub metrics_root: [u8; 32],
    pub submitted_by: Pubkey,
    pub submitted_at_slot: u64,
    pub rewarded_amount: u64,
    pub rewarded_at_slot: u64,
    pub bump: u8,
}

impl EpochMetrics {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 2 + 4 + 32 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct DomainNsDelegation {
    pub name_hash: [u8; 32],
    pub owner_wallet: Pubkey,
    pub operator_wallet: Pubkey,
    pub enabled: bool,
    pub created_at_slot: u64,
    pub updated_at_slot: u64,
    pub bump: u8,
}

impl DomainNsDelegation {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 8 + 8 + 1;
}

#[derive(Accounts)]
pub struct InitOperatorsConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + OperatorsConfig::SIZE,
        seeds = [b"operators_config"],
        bump
    )]
    pub operators_config: Account<'info, OperatorsConfig>,

    /// CHECK: validated in-program (must be owned by SPL Token program)
    pub toll_mint: UncheckedAccount<'info>,

    /// CHECK: PDA created as 0-data system account so it can sign SPL token transfers.
    #[account(mut, seeds = [b"treasury_authority"], bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub treasury_vault: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateOperatorsConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"operators_config"],
        bump = operators_config.bump,
        has_one = authority
    )]
    pub operators_config: Account<'info, OperatorsConfig>,
}

#[derive(Accounts)]
pub struct RegisterOperator<'info> {
    #[account(mut)]
    pub operator_wallet: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(
        init,
        payer = operator_wallet,
        space = 8 + Operator::SIZE,
        seeds = [b"operator", operator_wallet.key().as_ref()],
        bump
    )]
    pub operator: Account<'info, Operator>,

    /// CHECK: PDA created as 0-data system account to custody SOL stake.
    #[account(
        mut,
        seeds = [b"operator_vault", operator_wallet.key().as_ref()],
        bump
    )]
    pub operator_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEndpoints<'info> {
    pub operator_wallet: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(
        mut,
        seeds = [b"operator", operator_wallet.key().as_ref()],
        bump = operator.bump,
        constraint = operator.operator_wallet == operator_wallet.key() @ OperatorsError::OwnerMismatch
    )]
    pub operator: Account<'info, Operator>,
}

#[derive(Accounts)]
pub struct OperatorSelf<'info> {
    pub operator_wallet: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(
        mut,
        seeds = [b"operator", operator_wallet.key().as_ref()],
        bump = operator.bump,
        constraint = operator.operator_wallet == operator_wallet.key() @ OperatorsError::OwnerMismatch
    )]
    pub operator: Account<'info, Operator>,
}

#[derive(Accounts)]
pub struct StakeOperator<'info> {
    #[account(mut)]
    pub operator_wallet: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(
        mut,
        seeds = [b"operator", operator_wallet.key().as_ref()],
        bump = operator.bump,
        constraint = operator.operator_wallet == operator_wallet.key() @ OperatorsError::OwnerMismatch
    )]
    pub operator: Account<'info, Operator>,

    /// CHECK: PDA 0-data system account. Program signs to move lamports on unstake/slash.
    #[account(
        mut,
        seeds = [b"operator_vault", operator_wallet.key().as_ref()],
        bump = operator.vault_bump
    )]
    pub operator_vault: UncheckedAccount<'info>,

    // Included so System Program is in the transaction account list for CPI transfers.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeOperator<'info> {
    #[account(mut)]
    pub operator_wallet: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(
        mut,
        seeds = [b"operator", operator_wallet.key().as_ref()],
        bump = operator.bump,
        constraint = operator.operator_wallet == operator_wallet.key() @ OperatorsError::OwnerMismatch
    )]
    pub operator: Account<'info, Operator>,

    /// CHECK: PDA 0-data system account. Program signs to move lamports on unstake/slash.
    #[account(
        mut,
        seeds = [b"operator_vault", operator_wallet.key().as_ref()],
        bump = operator.vault_bump
    )]
    pub operator_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub authority_toll_ata: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct SubmitEpochMetrics<'info> {
    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        seeds = [b"operator", operator.operator_wallet.as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        init_if_needed,
        payer = submitter,
        space = 8 + EpochMetrics::SIZE,
        seeds = [b"metrics", epoch_id.to_le_bytes().as_ref(), operator.operator_wallet.as_ref()],
        bump
    )]
    pub epoch_metrics: Account<'info, EpochMetrics>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct ClaimOperatorRewards<'info> {
    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    pub operator_wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [b"operator", operator_wallet.key().as_ref()],
        bump = operator.bump,
        constraint = operator.operator_wallet == operator_wallet.key() @ OperatorsError::OwnerMismatch
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        mut,
        seeds = [b"metrics", epoch_id.to_le_bytes().as_ref(), operator_wallet.key().as_ref()],
        bump = epoch_metrics.bump
    )]
    pub epoch_metrics: Account<'info, EpochMetrics>,

    /// CHECK: PDA that owns treasury vault; signs token transfers.
    #[account(seeds = [b"treasury_authority"], bump = operators_config.treasury_authority_bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint)
    #[account(mut)]
    pub operator_payout_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8;32])]
pub struct SetDomainNsOperator<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + DomainNsDelegation::SIZE,
        seeds = [b"domain_ns", name_hash.as_ref()],
        bump
    )]
    pub domain_ns_delegation: Account<'info, DomainNsDelegation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SlashOperator<'info> {
    pub signer: Signer<'info>,

    #[account(seeds = [b"operators_config"], bump = operators_config.bump)]
    pub operators_config: Account<'info, OperatorsConfig>,

    /// CHECK: destination for slashed lamports (config.authority)
    #[account(mut, address = operators_config.authority)]
    pub authority_destination: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"operator", operator.operator_wallet.as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,

    /// CHECK: operator stake vault PDA
    #[account(
        mut,
        seeds = [b"operator_vault", operator.operator_wallet.as_ref()],
        bump = operator.vault_bump
    )]
    pub operator_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum OperatorsError {
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Bad epoch length.")]
    BadEpochLen,
    #[msg("Bad max endpoints.")]
    BadMaxEndpoints,
    #[msg("Too many endpoints.")]
    TooManyEndpoints,
    #[msg("Bad amount.")]
    BadAmount,
    #[msg("Insufficient stake.")]
    InsufficientStake,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Wrong epoch.")]
    WrongEpoch,
    #[msg("Program disabled.")]
    Disabled,
    #[msg("Not an allowlisted metrics submitter.")]
    NotSubmitter,
    #[msg("Too many metrics submitters.")]
    TooManySubmitters,
    #[msg("Too many slashing authorities.")]
    TooManySlashAuthorities,
    #[msg("Operator is slashed.")]
    OperatorSlashed,
    #[msg("Operator is not active.")]
    OperatorNotActive,
    #[msg("Nothing to claim.")]
    NothingToClaim,
    #[msg("Already rewarded for this epoch.")]
    AlreadyRewarded,
    #[msg("Metrics mismatch.")]
    MetricsMismatch,
    #[msg("Metrics already submitted by another submitter.")]
    MetricsAlreadySubmitted,
    #[msg("Payout ATA mismatch.")]
    PayoutAtaMismatch,
    #[msg("Owner mismatch.")]
    OwnerMismatch,
    #[msg("Bad basis points.")]
    BadBps,
    #[msg("Bad mint.")]
    BadMint,
    #[msg("Mint account is not owned by SPL Token program.")]
    BadMintOwner,
    #[msg("Bad treasury vault.")]
    BadTreasuryVault,
    #[msg("Treasury vault owner mismatch.")]
    BadTreasuryVaultOwner,
    #[msg("Source token-account owner mismatch.")]
    BadPayerAtaOwner,
    #[msg("Treasury authority already exists.")]
    TreasuryAuthorityAlreadyExists,
    #[msg("Treasury vault already exists.")]
    TreasuryVaultAlreadyExists,
    #[msg("Token account owner is not SPL Token program.")]
    BadTokenAccountOwner,
    #[msg("Token account data is invalid.")]
    BadTokenAccountData,
    #[msg("Operator stake vault already exists.")]
    VaultAlreadyExists,
    #[msg("Bad operator stake vault.")]
    BadVault,
}
