use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use sha2::{Digest, Sha256};
use spl_token::state::{Account as SplAccount, Mint as SplMint};

declare_id!("AsnMwghaaKanvcYSffPr9MgwfXJoYini3BzVjaPPVMoL");

const MAX_DOMAIN_LEN: usize = 253;
const MAX_EPOCH_CLAIM_RANGE: u16 = 32;
const MAX_ALLOWLIST: usize = 64;

#[program]
pub mod ddns_ns_incentives {
    use super::*;

    pub fn initialize_ns_config(
        ctx: Context<InitializeNsConfig>,
        epoch_len_slots: u64,
        ns_set_hash: [u8; 32],
        min_attestors: u16,
        reward_per_query: u64,
        max_reward_per_epoch: u64,
        max_epochs_claim_range: u16,
        allowlisted_verifiers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, NsError::BadEpochLen);
        require!(min_attestors > 0, NsError::BadMinAttestors);
        require!(
            max_epochs_claim_range > 0 && max_epochs_claim_range <= MAX_EPOCH_CLAIM_RANGE,
            NsError::BadClaimRange
        );
        require!(
            allowlisted_verifiers.len() <= MAX_ALLOWLIST,
            NsError::TooManyVerifiers
        );
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::ID,
            NsError::BadTokenProgram
        );

        // Create the vault authority PDA as a 0-space token authority account.
        // This keeps custody auditable and gives us a concrete account to pass to token CPI.
        create_pda_account(
            &ctx.accounts.admin.to_account_info(),
            &ctx.accounts.vault_authority.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &[b"vault_authority", &[ctx.bumps.vault_authority]],
            0,
            &crate::ID,
        )?;

        // Create + initialize reward vault token account PDA.
        // Address is deterministic: PDA(["reward_vault"]).
        create_pda_account(
            &ctx.accounts.admin.to_account_info(),
            &ctx.accounts.reward_vault.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &[b"reward_vault", &[ctx.bumps.reward_vault]],
            SplAccount::LEN,
            &spl_token::ID,
        )?;

        // Validate mint account is SPL token mint.
        require_keys_eq!(
            *ctx.accounts.toll_mint.to_account_info().owner,
            spl_token::ID,
            NsError::BadMint
        );
        let mint_ai = ctx.accounts.toll_mint.to_account_info();
        let mint_data = mint_ai.try_borrow_data()?;
        let _mint = SplMint::unpack(&mint_data).map_err(|_| NsError::BadMint)?;

        let init_ix = spl_token::instruction::initialize_account3(
            &spl_token::ID,
            &ctx.accounts.reward_vault.key(),
            &ctx.accounts.toll_mint.key(),
            &ctx.accounts.vault_authority.key(),
        )?;
        anchor_lang::solana_program::program::invoke(
            &init_ix,
            &[
                ctx.accounts.reward_vault.to_account_info(),
                ctx.accounts.toll_mint.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
            ],
        )?;

        let cfg = &mut ctx.accounts.ns_config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.toll_mint = ctx.accounts.toll_mint.key();
        cfg.reward_vault = ctx.accounts.reward_vault.key();
        cfg.vault_authority_bump = ctx.bumps.vault_authority;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.ns_set_hash = ns_set_hash;
        cfg.min_attestors = min_attestors;
        cfg.reward_per_query = reward_per_query;
        cfg.max_reward_per_epoch = max_reward_per_epoch;
        cfg.max_epochs_claim_range = max_epochs_claim_range;
        cfg.allowlisted_verifiers = allowlisted_verifiers;
        cfg.bump = ctx.bumps.ns_config;
        Ok(())
    }

    pub fn update_ns_config(
        ctx: Context<UpdateNsConfig>,
        epoch_len_slots: u64,
        ns_set_hash: [u8; 32],
        min_attestors: u16,
        reward_per_query: u64,
        max_reward_per_epoch: u64,
        max_epochs_claim_range: u16,
        allowlisted_verifiers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, NsError::BadEpochLen);
        require!(min_attestors > 0, NsError::BadMinAttestors);
        require!(
            max_epochs_claim_range > 0 && max_epochs_claim_range <= MAX_EPOCH_CLAIM_RANGE,
            NsError::BadClaimRange
        );
        require!(
            allowlisted_verifiers.len() <= MAX_ALLOWLIST,
            NsError::TooManyVerifiers
        );

        let cfg = &mut ctx.accounts.ns_config;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.ns_set_hash = ns_set_hash;
        cfg.min_attestors = min_attestors;
        cfg.reward_per_query = reward_per_query;
        cfg.max_reward_per_epoch = max_reward_per_epoch;
        cfg.max_epochs_claim_range = max_epochs_claim_range;
        cfg.allowlisted_verifiers = allowlisted_verifiers;
        Ok(())
    }

    pub fn fund_rewards(ctx: Context<FundRewards>, amount: u64) -> Result<()> {
        require!(amount > 0, NsError::BadAmount);
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::ID,
            NsError::BadTokenProgram
        );

        // admin_from -> reward_vault
        let ix = spl_token::instruction::transfer(
            &spl_token::ID,
            &ctx.accounts.admin_from.key(),
            &ctx.accounts.reward_vault.key(),
            &ctx.accounts.admin.key(),
            &[],
            amount,
        )?;
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.admin_from.to_account_info(),
                ctx.accounts.reward_vault.to_account_info(),
                ctx.accounts.admin.to_account_info(),
            ],
        )?;
        Ok(())
    }

    pub fn create_ns_claim(
        ctx: Context<CreateNsClaim>,
        domain: String,
        domain_hash: [u8; 32],
    ) -> Result<()> {
        let normalized = normalize_domain(&domain)?;
        let expected = sha256_32(&normalized);
        require!(expected == domain_hash, NsError::DomainHashMismatch);

        let claim = &mut ctx.accounts.ns_claim;
        claim.domain_hash = domain_hash;
        claim.domain_len = normalized.len() as u8;
        claim.domain_bytes = [0u8; MAX_DOMAIN_LEN];
        claim.domain_bytes[..normalized.len()].copy_from_slice(&normalized);
        claim.owner_wallet = ctx.accounts.owner_wallet.key();
        claim.created_at_slot = Clock::get()?.slot;
        claim.status = ClaimStatus::Active as u8;
        claim.last_claimed_epoch = 0;
        claim.bump = ctx.bumps.ns_claim;
        Ok(())
    }

    pub fn revoke_ns_claim(ctx: Context<RevokeNsClaim>) -> Result<()> {
        ctx.accounts.ns_claim.status = ClaimStatus::Revoked as u8;
        Ok(())
    }

    pub fn submit_delegation_attestation(
        ctx: Context<SubmitDelegationAttestation>,
        domain_hash: [u8; 32],
        epoch_id: u64,
        control_proof_hash: [u8; 32],
        observed_at_slot: u64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.ns_config;
        require_is_allowlisted(cfg, &ctx.accounts.attestor.key())?;
        require!(ctx.accounts.ns_claim.domain_hash == domain_hash, NsError::AttestationMismatch);
        require!(
            ctx.accounts.ns_claim.status == ClaimStatus::Active as u8,
            NsError::ClaimNotActive
        );

        let current_epoch = epoch_id_from_slot(Clock::get()?.slot, cfg.epoch_len_slots)?;
        require!(current_epoch == epoch_id, NsError::WrongEpoch);

        let att = &mut ctx.accounts.epoch_attestation;
        att.domain_hash = ctx.accounts.ns_claim.domain_hash;
        att.epoch_id = epoch_id;
        att.attestor = ctx.accounts.attestor.key();
        att.ns_set_hash = cfg.ns_set_hash;
        att.control_proof_hash = control_proof_hash;
        att.observed_at_slot = observed_at_slot;
        att.bump = ctx.bumps.epoch_attestation;
        Ok(())
    }

    pub fn submit_usage_aggregate(
        ctx: Context<SubmitUsageAggregate>,
        domain_hash: [u8; 32],
        epoch_id: u64,
        query_count: u64,
        receipts_root: [u8; 32],
        submitted_at_slot: u64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.ns_config;
        require_is_allowlisted(cfg, &ctx.accounts.attestor.key())?;
        require!(ctx.accounts.ns_claim.domain_hash == domain_hash, NsError::UsageMismatch);
        require!(
            ctx.accounts.ns_claim.status == ClaimStatus::Active as u8,
            NsError::ClaimNotActive
        );

        let current_epoch = epoch_id_from_slot(Clock::get()?.slot, cfg.epoch_len_slots)?;
        require!(current_epoch == epoch_id, NsError::WrongEpoch);

        let usage = &mut ctx.accounts.epoch_usage;
        usage.domain_hash = ctx.accounts.ns_claim.domain_hash;
        usage.epoch_id = epoch_id;
        usage.query_count = query_count;
        usage.receipts_root = receipts_root;
        usage.attestor_count = 1; // MVP: single allowlisted submitter.
        usage.submitted_by = ctx.accounts.attestor.key();
        usage.submitted_at_slot = submitted_at_slot;
        usage.finalized = true; // MVP: allowlisted implies final.
        usage.bump = ctx.bumps.epoch_usage;
        Ok(())
    }

    pub fn claim_ns_rewards(
        ctx: Context<ClaimNsRewards>,
        from_epoch: u64,
        to_epoch: u64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.ns_config;
        let claim = &mut ctx.accounts.ns_claim;
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            spl_token::ID,
            NsError::BadTokenProgram
        );

        require!(claim.status == ClaimStatus::Active as u8, NsError::ClaimNotActive);
        require!(from_epoch <= to_epoch, NsError::BadEpochRange);
        require!(from_epoch > claim.last_claimed_epoch, NsError::EpochAlreadyClaimed);

        let epochs = (to_epoch - from_epoch + 1) as u64;
        require!(
            epochs <= cfg.max_epochs_claim_range as u64,
            NsError::EpochRangeTooLarge
        );

        // remaining_accounts layout per epoch:
        // - 1x EpochUsageAggregate PDA
        // - N x EpochDelegationAttestation PDAs (N = cfg.min_attestors)
        let per_epoch_accounts = 1usize + (cfg.min_attestors as usize);
        require!(
            ctx.remaining_accounts.len() == (epochs as usize) * per_epoch_accounts,
            NsError::BadRemainingAccounts
        );

        let mut total_reward: u64 = 0;

        for i in 0..(epochs as usize) {
            let epoch_id = from_epoch + (i as u64);

            let base = i * per_epoch_accounts;
            let usage_info = &ctx.remaining_accounts[base];

            // Verify and deserialize usage aggregate.
            let expected_usage_key = Pubkey::find_program_address(
                &[
                    b"ns_usage",
                    claim.domain_hash.as_ref(),
                    epoch_id.to_le_bytes().as_ref(),
                ],
                &crate::ID,
            )
            .0;
            require_keys_eq!(usage_info.key(), expected_usage_key, NsError::BadUsagePda);
            require_keys_eq!(*usage_info.owner, crate::ID, NsError::UsageMismatch);
            let mut usage_data: &[u8] = &usage_info.try_borrow_data()?;
            let usage = EpochUsageAggregate::try_deserialize(&mut usage_data)?;
            require!(usage.domain_hash == claim.domain_hash, NsError::UsageMismatch);
            require!(usage.epoch_id == epoch_id, NsError::UsageMismatch);
            require!(usage.finalized, NsError::UsageNotFinalized);

            // Count attestation PDAs for this epoch.
            let mut unique_attestors: Vec<Pubkey> = Vec::with_capacity(cfg.min_attestors as usize);

            for j in 0..(cfg.min_attestors as usize) {
                let att_info = &ctx.remaining_accounts[base + 1 + j];
                require_keys_eq!(*att_info.owner, crate::ID, NsError::AttestationMismatch);
                let mut att_data: &[u8] = &att_info.try_borrow_data()?;
                let att = EpochDelegationAttestation::try_deserialize(&mut att_data)?;

                require!(att.domain_hash == claim.domain_hash, NsError::AttestationMismatch);
                require!(att.epoch_id == epoch_id, NsError::AttestationMismatch);
                require!(att.ns_set_hash == cfg.ns_set_hash, NsError::AttestationMismatch);
                require_is_allowlisted(cfg, &att.attestor)?;

                let expected_att_key = Pubkey::find_program_address(
                    &[
                        b"ns_attest",
                        claim.domain_hash.as_ref(),
                        epoch_id.to_le_bytes().as_ref(),
                        att.attestor.as_ref(),
                    ],
                    &crate::ID,
                )
                .0;
                require_keys_eq!(att_info.key(), expected_att_key, NsError::BadAttestationPda);

                if !unique_attestors.iter().any(|k| *k == att.attestor) {
                    unique_attestors.push(att.attestor);
                }
            }

            require!(
                unique_attestors.len() >= (cfg.min_attestors as usize),
                NsError::NotEnoughAttestors
            );

            let raw = usage.query_count.saturating_mul(cfg.reward_per_query);
            let epoch_reward = raw.min(cfg.max_reward_per_epoch);
            total_reward = total_reward.saturating_add(epoch_reward);
        }

        require!(total_reward > 0, NsError::NothingToClaim);

        let ix = spl_token::instruction::transfer(
            &spl_token::ID,
            &ctx.accounts.reward_vault.key(),
            &ctx.accounts.owner_token_account.key(),
            &ctx.accounts.vault_authority.key(),
            &[],
            total_reward,
        )?;
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault_authority", &[cfg.vault_authority_bump]]];
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.reward_vault.to_account_info(),
                ctx.accounts.owner_token_account.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
            ],
            signer_seeds,
        )?;

        claim.last_claimed_epoch = to_epoch;
        Ok(())
    }
}

fn epoch_id_from_slot(slot: u64, epoch_len_slots: u64) -> Result<u64> {
    require!(epoch_len_slots > 0, NsError::BadEpochLen);
    Ok(slot / epoch_len_slots)
}

fn require_is_allowlisted(cfg: &NsConfig, key: &Pubkey) -> Result<()> {
    require!(
        cfg.allowlisted_verifiers.iter().any(|k| k == key),
        NsError::NotAllowlisted
    );
    Ok(())
}

fn normalize_domain(domain: &str) -> Result<Vec<u8>> {
    let mut d = domain.trim().to_ascii_lowercase();
    if d.ends_with('.') {
        d.pop();
    }
    require!(!d.is_empty(), NsError::BadDomain);
    require!(d.len() <= MAX_DOMAIN_LEN, NsError::BadDomain);
    for b in d.bytes() {
        let ok = (b'a'..=b'z').contains(&b)
            || (b'0'..=b'9').contains(&b)
            || b == b'-'
            || b == b'.';
        require!(ok, NsError::BadDomain);
    }
    Ok(d.into_bytes())
}

fn sha256_32(bytes: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().into()
}

fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    new_account: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    seeds: &[&[u8]],
    space: usize,
    owner: &Pubkey,
) -> Result<()> {
    // Create only if empty. This keeps init idempotent for PDAs.
    if !(new_account.data_is_empty() && new_account.lamports() == 0) {
        return Ok(());
    }

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space);
    let ix = anchor_lang::solana_program::system_instruction::create_account(
        payer.key,
        new_account.key,
        lamports,
        space as u64,
        owner,
    );

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[payer.clone(), new_account.clone(), system_program.clone()],
        &[seeds],
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeNsConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + NsConfig::SIZE,
        seeds = [b"ns_config"],
        bump
    )]
    pub ns_config: Account<'info, NsConfig>,

    #[account(
        mut,
        seeds = [b"vault_authority"],
        bump
    )]
    /// CHECK: PDA token authority used to sign SPL token transfers from the reward vault.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: validated as SPL token mint in handler.
    pub toll_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"reward_vault"],
        bump
    )]
    /// CHECK: PDA SPL token account, created + initialized in the handler.
    pub reward_vault: UncheckedAccount<'info>,

    /// CHECK: must equal SPL token program id.
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateNsConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"ns_config"],
        bump = ns_config.bump,
        has_one = admin
    )]
    pub ns_config: Account<'info, NsConfig>,
}

#[derive(Accounts)]
pub struct FundRewards<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"ns_config"], bump = ns_config.bump, has_one = admin)]
    pub ns_config: Account<'info, NsConfig>,

    /// CHECK: SPL token account owned by admin (source).
    #[account(mut)]
    pub admin_from: UncheckedAccount<'info>,

    /// CHECK: SPL token account (reward vault) at config.reward_vault.
    #[account(mut, address = ns_config.reward_vault)]
    pub reward_vault: UncheckedAccount<'info>,

    /// CHECK: SPL token program.
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(domain: String, domain_hash: [u8;32])]
pub struct CreateNsClaim<'info> {
    #[account(seeds = [b"ns_config"], bump = ns_config.bump)]
    pub ns_config: Account<'info, NsConfig>,

    #[account(
        init,
        payer = owner_wallet,
        space = 8 + NsClaim::SIZE,
        seeds = [b"ns_claim", domain_hash.as_ref()],
        bump
    )]
    pub ns_claim: Account<'info, NsClaim>,

    #[account(mut)]
    pub owner_wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeNsClaim<'info> {
    #[account(mut)]
    pub owner_wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [b"ns_claim", ns_claim.domain_hash.as_ref()],
        bump = ns_claim.bump,
        has_one = owner_wallet
    )]
    pub ns_claim: Account<'info, NsClaim>,
}

#[derive(Accounts)]
#[instruction(domain_hash: [u8;32], epoch_id: u64)]
pub struct SubmitDelegationAttestation<'info> {
    #[account(seeds = [b"ns_config"], bump = ns_config.bump)]
    pub ns_config: Account<'info, NsConfig>,

    #[account(
        seeds = [b"ns_claim", domain_hash.as_ref()],
        bump = ns_claim.bump
    )]
    pub ns_claim: Account<'info, NsClaim>,

    #[account(
        init,
        payer = attestor,
        space = 8 + EpochDelegationAttestation::SIZE,
        seeds = [b"ns_attest", domain_hash.as_ref(), epoch_id.to_le_bytes().as_ref(), attestor.key().as_ref()],
        bump
    )]
    pub epoch_attestation: Account<'info, EpochDelegationAttestation>,

    #[account(mut)]
    pub attestor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(domain_hash: [u8;32], epoch_id: u64)]
pub struct SubmitUsageAggregate<'info> {
    #[account(seeds = [b"ns_config"], bump = ns_config.bump)]
    pub ns_config: Account<'info, NsConfig>,

    #[account(
        seeds = [b"ns_claim", domain_hash.as_ref()],
        bump = ns_claim.bump
    )]
    pub ns_claim: Account<'info, NsClaim>,

    #[account(
        init_if_needed,
        payer = attestor,
        space = 8 + EpochUsageAggregate::SIZE,
        seeds = [b"ns_usage", domain_hash.as_ref(), epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch_usage: Account<'info, EpochUsageAggregate>,

    #[account(mut)]
    pub attestor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimNsRewards<'info> {
    #[account(seeds = [b"ns_config"], bump = ns_config.bump)]
    pub ns_config: Account<'info, NsConfig>,

    #[account(
        mut,
        seeds = [b"ns_claim", ns_claim.domain_hash.as_ref()],
        bump = ns_claim.bump,
        has_one = owner_wallet
    )]
    pub ns_claim: Account<'info, NsClaim>,

    pub owner_wallet: Signer<'info>,

    /// CHECK: SPL token reward vault.
    #[account(mut, address = ns_config.reward_vault)]
    pub reward_vault: UncheckedAccount<'info>,

    #[account(seeds = [b"vault_authority"], bump = ns_config.vault_authority_bump)]
    /// CHECK: PDA token authority used to sign SPL token transfers from the reward vault.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: owner ATA for TOLL mint (client-provided).
    #[account(mut)]
    pub owner_token_account: UncheckedAccount<'info>,

    /// CHECK: SPL token program.
    pub token_program: UncheckedAccount<'info>,
}

#[account]
pub struct NsConfig {
    pub admin: Pubkey,
    pub toll_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub vault_authority_bump: u8,
    pub epoch_len_slots: u64,
    pub ns_set_hash: [u8; 32],
    pub min_attestors: u16,
    pub reward_per_query: u64,
    pub max_reward_per_epoch: u64,
    pub max_epochs_claim_range: u16,
    pub allowlisted_verifiers: Vec<Pubkey>,
    pub bump: u8,
}

impl NsConfig {
    pub const SIZE: usize = 32
        + 32
        + 32
        + 1
        + 8
        + 32
        + 2
        + 8
        + 8
        + 2
        + 4
        + (MAX_ALLOWLIST * 32)
        + 1;
}

#[account]
pub struct NsClaim {
    pub domain_hash: [u8; 32],
    pub domain_len: u8,
    pub domain_bytes: [u8; MAX_DOMAIN_LEN],
    pub owner_wallet: Pubkey,
    pub created_at_slot: u64,
    pub status: u8,
    pub last_claimed_epoch: u64,
    pub bump: u8,
}

impl NsClaim {
    pub const SIZE: usize = 32 + 1 + MAX_DOMAIN_LEN + 32 + 8 + 1 + 8 + 1;
}

#[account]
pub struct EpochDelegationAttestation {
    pub domain_hash: [u8; 32],
    pub epoch_id: u64,
    pub attestor: Pubkey,
    pub ns_set_hash: [u8; 32],
    pub control_proof_hash: [u8; 32],
    pub observed_at_slot: u64,
    pub bump: u8,
}

impl EpochDelegationAttestation {
    pub const SIZE: usize = 32 + 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct EpochUsageAggregate {
    pub domain_hash: [u8; 32],
    pub epoch_id: u64,
    pub query_count: u64,
    pub receipts_root: [u8; 32],
    pub attestor_count: u16,
    pub submitted_by: Pubkey,
    pub submitted_at_slot: u64,
    pub finalized: bool,
    pub bump: u8,
}

impl EpochUsageAggregate {
    pub const SIZE: usize = 32 + 8 + 8 + 32 + 2 + 32 + 8 + 1 + 1;
}

#[repr(u8)]
pub enum ClaimStatus {
    Pending = 0,
    Active = 1,
    Revoked = 2,
}

#[error_code]
pub enum NsError {
    #[msg("Bad domain.")]
    BadDomain,
    #[msg("Domain hash mismatch.")]
    DomainHashMismatch,
    #[msg("Claim not active.")]
    ClaimNotActive,
    #[msg("Not allowlisted.")]
    NotAllowlisted,
    #[msg("Wrong epoch.")]
    WrongEpoch,
    #[msg("Bad epoch length.")]
    BadEpochLen,
    #[msg("Bad minimum attestors.")]
    BadMinAttestors,
    #[msg("Bad claim range.")]
    BadClaimRange,
    #[msg("Too many verifiers.")]
    TooManyVerifiers,
    #[msg("Bad amount.")]
    BadAmount,
    #[msg("Bad SPL token mint.")]
    BadMint,
    #[msg("Bad token program.")]
    BadTokenProgram,
    #[msg("Bad epoch range.")]
    BadEpochRange,
    #[msg("Epoch already claimed.")]
    EpochAlreadyClaimed,
    #[msg("Epoch range too large.")]
    EpochRangeTooLarge,
    #[msg("Bad remaining accounts layout.")]
    BadRemainingAccounts,
    #[msg("Bad usage PDA.")]
    BadUsagePda,
    #[msg("Usage mismatch.")]
    UsageMismatch,
    #[msg("Usage not finalized.")]
    UsageNotFinalized,
    #[msg("Bad attestation PDA.")]
    BadAttestationPda,
    #[msg("Attestation mismatch.")]
    AttestationMismatch,
    #[msg("Not enough attestors.")]
    NotEnoughAttestors,
    #[msg("Nothing to claim.")]
    NothingToClaim,
}
