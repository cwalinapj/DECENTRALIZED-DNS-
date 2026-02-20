use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use anchor_lang::solana_program::program_pack::Pack;
use sha2::{Digest, Sha256};
use spl_token::state::Account as SplTokenAccount;

declare_id!("5jcbSwHWNzuSMY7iJJTeVaQtaT14gpu9x3RPeQ8ZhxJX");

const MAX_VERIFIERS: usize = 64;

#[program]
pub mod ddns_rewards {
    use super::*;

    pub fn init_rewards_config(
        ctx: Context<InitRewardsConfig>,
        domain_share_bps: u16,
        epoch_reward_bps: u16,
        min_toll_amount: u64,
        epoch_len_slots: u64,
        max_reward_per_epoch_per_domain: u64,
        min_unique_wallets: u32,
        challenge_ttl_slots: u64,
        enabled: bool,
        verifiers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, RewardsError::BadEpochLen);
        require!(domain_share_bps <= 10_000, RewardsError::BadBps);
        require!(epoch_reward_bps <= 10_000, RewardsError::BadBps);
        require!(verifiers.len() <= MAX_VERIFIERS, RewardsError::TooManyVerifiers);

        // Create the treasury_authority PDA as a 0-data system account so it can be used as a signer
        // in Token Program CPIs (matches ddns_stake pattern).
        require!(
            ctx.accounts.treasury_authority.data_is_empty()
                && ctx.accounts.treasury_authority.lamports() == 0,
            RewardsError::TreasuryAuthorityAlreadyExists
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

        // Create + initialize the treasury_vault SPL token account (owned by Token Program).
        require!(
            ctx.accounts.treasury_vault.data_is_empty() && ctx.accounts.treasury_vault.lamports() == 0,
            RewardsError::TreasuryVaultAlreadyExists
        );
        require!(
            *ctx.accounts.toll_mint.owner == ctx.accounts.token_program.key(),
            RewardsError::BadMintOwner
        );

        let rent = Rent::get()?;
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

        let cfg = &mut ctx.accounts.rewards_config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.toll_mint = ctx.accounts.toll_mint.key();
        cfg.treasury_vault = ctx.accounts.treasury_vault.key();
        cfg.treasury_authority_bump = ctx.bumps.treasury_authority;
        cfg.domain_share_bps = domain_share_bps;
        cfg.epoch_reward_bps = epoch_reward_bps;
        cfg.min_toll_amount = min_toll_amount;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.max_reward_per_epoch_per_domain = max_reward_per_epoch_per_domain;
        cfg.min_unique_wallets = min_unique_wallets;
        cfg.challenge_ttl_slots = challenge_ttl_slots;
        cfg.enabled = enabled;
        cfg.verifiers = verifiers;
        cfg.bump = ctx.bumps.rewards_config;
        Ok(())
    }

    pub fn update_rewards_config(
        ctx: Context<UpdateRewardsConfig>,
        domain_share_bps: u16,
        epoch_reward_bps: u16,
        min_toll_amount: u64,
        epoch_len_slots: u64,
        max_reward_per_epoch_per_domain: u64,
        min_unique_wallets: u32,
        challenge_ttl_slots: u64,
        enabled: bool,
        verifiers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, RewardsError::BadEpochLen);
        require!(domain_share_bps <= 10_000, RewardsError::BadBps);
        require!(epoch_reward_bps <= 10_000, RewardsError::BadBps);
        require!(verifiers.len() <= MAX_VERIFIERS, RewardsError::TooManyVerifiers);

        let cfg = &mut ctx.accounts.rewards_config;
        cfg.domain_share_bps = domain_share_bps;
        cfg.epoch_reward_bps = epoch_reward_bps;
        cfg.min_toll_amount = min_toll_amount;
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.max_reward_per_epoch_per_domain = max_reward_per_epoch_per_domain;
        cfg.min_unique_wallets = min_unique_wallets;
        cfg.challenge_ttl_slots = challenge_ttl_slots;
        cfg.enabled = enabled;
        cfg.verifiers = verifiers;
        Ok(())
    }

    // Domain owner creates an on-chain challenge; off-chain they publish the nonce via DNS TXT/HTTPS.
    // Client supplies `domain_hash` so it can be used as PDA seed; program recomputes it and requires match.
    pub fn start_domain_challenge(
        ctx: Context<StartDomainChallenge>,
        fqdn: String,
        domain_hash: [u8; 32],
        nonce: [u8; 16],
    ) -> Result<()> {
        let want = compute_domain_hash(&fqdn)?;
        require!(want == domain_hash, RewardsError::DomainHashMismatch);

        let slot = Clock::get()?.slot;
        let expires = slot
            .checked_add(ctx.accounts.rewards_config.challenge_ttl_slots)
            .ok_or(RewardsError::Overflow)?;

        let ch = &mut ctx.accounts.domain_challenge;
        ch.domain_hash = domain_hash;
        ch.owner_wallet = ctx.accounts.owner.key();
        ch.nonce = nonce;
        ch.expires_at_slot = expires;
        ch.bump = ctx.bumps.domain_challenge;
        Ok(())
    }

    // MVP: called by the gateway/tollbooth authority after verifying TXT/HTTPS proof off-chain.
    // On-chain: requires authority == config.authority and a valid, unexpired DomainChallenge.
    pub fn claim_domain(
        ctx: Context<ClaimDomain>,
        fqdn: String,
        domain_hash: [u8; 32],
        nonce: [u8; 16],
        payout_token_account: Pubkey,
    ) -> Result<()> {
        let want = compute_domain_hash(&fqdn)?;
        require!(want == domain_hash, RewardsError::DomainHashMismatch);

        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.rewards_config.authority,
            RewardsError::Unauthorized
        );

        let slot = Clock::get()?.slot;
        require!(
            slot <= ctx.accounts.domain_challenge.expires_at_slot,
            RewardsError::ChallengeExpired
        );
        require!(
            ctx.accounts.domain_challenge.domain_hash == domain_hash
                && ctx.accounts.domain_challenge.nonce == nonce,
            RewardsError::ChallengeMismatch
        );

        let claim = &mut ctx.accounts.domain_claim;
        if claim.status != DomainClaimStatus::Unverified as u8
            && claim.status != DomainClaimStatus::Verified as u8
        {
            // Revoked claims must be explicitly recreated later (future).
            return err!(RewardsError::ClaimRevoked);
        }

        // Initialize fields for new claims or overwrite if previously unverified.
        let owner_wallet = ctx.accounts.domain_challenge.owner_wallet;
        require_keys_eq!(owner_wallet, ctx.accounts.owner_wallet.key(), RewardsError::OwnerMismatch);

        claim.domain_hash = domain_hash;
        let mut fqdn_len: u8 = 0;
        let mut fqdn_bytes = [0u8; 253];
        write_fqdn_bytes(&fqdn, &mut fqdn_bytes, &mut fqdn_len)?;
        claim.fqdn_bytes = fqdn_bytes;
        claim.fqdn_len = fqdn_len;
        claim.owner_wallet = owner_wallet;
        claim.payout_token_account = payout_token_account;
        claim.status = DomainClaimStatus::Verified as u8;
        claim.verified_at_slot = slot;
        claim.bump = ctx.bumps.domain_claim;
        Ok(())
    }

    pub fn revoke_domain_claim(ctx: Context<RevokeDomainClaim>) -> Result<()> {
        require!(
            ctx.accounts.domain_claim.status == DomainClaimStatus::Verified as u8
                || ctx.accounts.domain_claim.status == DomainClaimStatus::Unverified as u8,
            RewardsError::BadClaimStatus
        );
        ctx.accounts.domain_claim.status = DomainClaimStatus::Revoked as u8;
        Ok(())
    }

    // MVP: payer pays a TOLL amount into the protocol treasury.
    pub fn pay_toll(ctx: Context<PayToll>, toll_amount: u64) -> Result<()> {
        require!(toll_amount > 0, RewardsError::BadAmount);
        require!(
            toll_amount >= ctx.accounts.rewards_config.min_toll_amount,
            RewardsError::BelowMinToll
        );

        let cfg = &ctx.accounts.rewards_config;
        require!(
            ctx.accounts.treasury_vault.key() == cfg.treasury_vault,
            RewardsError::BadTreasuryVault
        );

        let payer_ata = read_spl_token_account(
            &ctx.accounts.payer_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(payer_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        require!(
            payer_ata.owner == ctx.accounts.payer.key(),
            RewardsError::BadPayerAtaOwner
        );

        let vault_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(vault_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        let (ta, _) = Pubkey::find_program_address(&[b"treasury_authority"], ctx.program_id);
        require!(vault_ata.owner == ta, RewardsError::BadTreasuryVaultOwner);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_toll_ata.to_account_info(),
                to: ctx.accounts.treasury_vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, toll_amount)?;
        Ok(())
    }

    // Same as pay_toll, but shares `domain_share_bps` with a verified DomainClaim payout account.
    pub fn pay_toll_with_domain(
        ctx: Context<PayTollWithDomain>,
        domain_hash: [u8; 32],
        toll_amount: u64,
    ) -> Result<()> {
        require!(toll_amount > 0, RewardsError::BadAmount);
        require!(
            toll_amount >= ctx.accounts.rewards_config.min_toll_amount,
            RewardsError::BelowMinToll
        );

        let cfg = &ctx.accounts.rewards_config;
        let claim = &ctx.accounts.domain_claim;
        require!(claim.domain_hash == domain_hash, RewardsError::DomainHashMismatch);
        require!(
            claim.status == DomainClaimStatus::Verified as u8,
            RewardsError::ClaimNotVerified
        );
        require_keys_eq!(
            claim.payout_token_account,
            ctx.accounts.domain_owner_payout_ata.key(),
            RewardsError::PayoutAtaMismatch
        );

        require!(
            ctx.accounts.treasury_vault.key() == cfg.treasury_vault,
            RewardsError::BadTreasuryVault
        );

        let payer_ata = read_spl_token_account(
            &ctx.accounts.payer_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(payer_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        require!(
            payer_ata.owner == ctx.accounts.payer.key(),
            RewardsError::BadPayerAtaOwner
        );

        let payout_ata = read_spl_token_account(
            &ctx.accounts.domain_owner_payout_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(payout_ata.mint == cfg.toll_mint, RewardsError::BadMint);

        let vault_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(vault_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        let (ta, _) = Pubkey::find_program_address(&[b"treasury_authority"], ctx.program_id);
        require!(vault_ata.owner == ta, RewardsError::BadTreasuryVaultOwner);

        let share = ((toll_amount as u128)
            .checked_mul(cfg.domain_share_bps as u128)
            .ok_or(RewardsError::Overflow)?
            / 10_000u128) as u64;
        let remainder = toll_amount
            .checked_sub(share)
            .ok_or(RewardsError::Overflow)?;

        if share > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_toll_ata.to_account_info(),
                    to: ctx.accounts.domain_owner_payout_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            );
            token::transfer(cpi_ctx, share)?;
        }

        if remainder > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_toll_ata.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            );
            token::transfer(cpi_ctx, remainder)?;
        }

        Ok(())
    }

    // Admin can top up the treasury vault (for epoch-bonus rewards).
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, RewardsError::BadAmount);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.rewards_config.authority,
            RewardsError::Unauthorized
        );

        let cfg = &ctx.accounts.rewards_config;
        require!(
            ctx.accounts.treasury_vault.key() == cfg.treasury_vault,
            RewardsError::BadTreasuryVault
        );

        let authority_ata = read_spl_token_account(
            &ctx.accounts.authority_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(authority_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        require!(
            authority_ata.owner == ctx.accounts.authority.key(),
            RewardsError::BadPayerAtaOwner
        );

        let vault_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(vault_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        let (ta, _) = Pubkey::find_program_address(&[b"treasury_authority"], ctx.program_id);
        require!(vault_ata.owner == ta, RewardsError::BadTreasuryVaultOwner);

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

    // MVP: allowlisted miner/verifier submits a usage aggregate for (domain, epoch).
    // On-chain does NOT verify receipts; it only commits aggregate data for auditability.
    pub fn submit_domain_usage(
        ctx: Context<SubmitDomainUsage>,
        epoch_id: u64,
        domain_hash: [u8; 32],
        query_count: u64,
        paid_toll_amount: u64,
        unique_wallet_count: u32,
        aggregate_root: [u8; 32],
    ) -> Result<()> {
        require_is_verifier(&ctx.accounts.rewards_config, &ctx.accounts.submitter.key())?;

        require!(
            ctx.accounts.domain_claim.domain_hash == domain_hash,
            RewardsError::DomainHashMismatch
        );
        require!(
            ctx.accounts.domain_claim.status == DomainClaimStatus::Verified as u8,
            RewardsError::ClaimNotVerified
        );

        let slot = Clock::get()?.slot;
        let got_epoch = epoch_id_from_slot(slot, ctx.accounts.rewards_config.epoch_len_slots)?;
        require!(got_epoch == epoch_id, RewardsError::WrongEpoch);

        let u = &mut ctx.accounts.domain_usage_epoch;
        u.domain_hash = domain_hash;
        u.epoch_id = epoch_id;
        u.query_count = query_count;
        u.paid_toll_amount = paid_toll_amount;
        u.unique_wallet_count = unique_wallet_count;
        u.aggregate_root = aggregate_root;
        u.submitted_by = ctx.accounts.submitter.key();
        u.submitted_at_slot = slot;
        u.rewarded_amount = 0;
        u.rewarded_at_slot = 0;
        u.bump = ctx.bumps.domain_usage_epoch;
        Ok(())
    }

    // Domain owner claims an epoch-bonus reward from the treasury vault (optional, controlled by config.enabled).
    pub fn claim_domain_rewards(
        ctx: Context<ClaimDomainRewards>,
        epoch_id: u64,
        domain_hash: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.rewards_config;
        require!(cfg.enabled, RewardsError::RewardsDisabled);

        let claim = &ctx.accounts.domain_claim;
        require!(claim.domain_hash == domain_hash, RewardsError::DomainHashMismatch);
        require!(
            claim.status == DomainClaimStatus::Verified as u8,
            RewardsError::ClaimNotVerified
        );
        require_keys_eq!(claim.owner_wallet, ctx.accounts.owner.key(), RewardsError::OwnerMismatch);
        require_keys_eq!(
            claim.payout_token_account,
            ctx.accounts.owner_toll_ata.key(),
            RewardsError::PayoutAtaMismatch
        );
        let owner_ata = read_spl_token_account(
            &ctx.accounts.owner_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(owner_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        require!(
            owner_ata.owner == ctx.accounts.owner.key(),
            RewardsError::BadPayerAtaOwner
        );

        let u = &mut ctx.accounts.domain_usage_epoch;
        require!(u.domain_hash == domain_hash, RewardsError::DomainHashMismatch);
        require!(u.epoch_id == epoch_id, RewardsError::WrongEpoch);
        require!(u.rewarded_amount == 0, RewardsError::AlreadyRewarded);

        require!(
            u.paid_toll_amount >= cfg.min_toll_amount,
            RewardsError::BelowMinToll
        );
        require!(
            u.unique_wallet_count >= cfg.min_unique_wallets,
            RewardsError::NotEnoughUniqueWallets
        );

        let raw = ((u.paid_toll_amount as u128)
            .checked_mul(cfg.epoch_reward_bps as u128)
            .ok_or(RewardsError::Overflow)?
            / 10_000u128) as u64;
        let reward = raw.min(cfg.max_reward_per_epoch_per_domain);
        require!(reward > 0, RewardsError::NothingToClaim);

        require!(
            ctx.accounts.treasury_vault.key() == cfg.treasury_vault,
            RewardsError::BadTreasuryVault
        );
        let vault_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(vault_ata.mint == cfg.toll_mint, RewardsError::BadMint);
        require!(
            vault_ata.owner == ctx.accounts.treasury_authority.key(),
            RewardsError::BadTreasuryVaultOwner
        );

        let auth_seeds: &[&[u8]] = &[b"treasury_authority", &[cfg.treasury_authority_bump]];
        let signer_seeds: &[&[&[u8]]] = &[auth_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.owner_toll_ata.to_account_info(),
                authority: ctx.accounts.treasury_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, reward)?;

        u.rewarded_amount = reward;
        u.rewarded_at_slot = Clock::get()?.slot;
        Ok(())
    }
}

fn epoch_id_from_slot(slot: u64, epoch_len_slots: u64) -> Result<u64> {
    require!(epoch_len_slots > 0, RewardsError::BadEpochLen);
    Ok(slot / epoch_len_slots)
}

fn require_is_verifier(cfg: &RewardsConfig, key: &Pubkey) -> Result<()> {
    require!(
        cfg.verifiers.iter().any(|k| k == key),
        RewardsError::NotVerifier
    );
    Ok(())
}

fn compute_domain_hash(fqdn: &str) -> Result<[u8; 32]> {
    let normalized = normalize_fqdn(fqdn)?;
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    Ok(hasher.finalize().into())
}

fn normalize_fqdn(fqdn: &str) -> Result<String> {
    let mut s = fqdn.trim().to_string();
    // Strip one trailing dot to support fully-qualified input.
    if s.ends_with('.') {
        s.pop();
    }

    // MVP: ASCII lowercase only (punycode handled off-chain in later phases).
    // This keeps on-chain normalization deterministic and cheap.
    s.make_ascii_lowercase();
    require!(!s.is_empty(), RewardsError::BadFqdn);
    require!(s.len() <= 253, RewardsError::BadFqdn);
    Ok(s)
}

fn write_fqdn_bytes(fqdn: &str, out: &mut [u8; 253], out_len: &mut u8) -> Result<()> {
    let normalized = normalize_fqdn(fqdn)?;
    let b = normalized.as_bytes();
    require!(b.len() <= 253, RewardsError::BadFqdn);
    out.fill(0);
    out[..b.len()].copy_from_slice(b);
    *out_len = b.len() as u8;
    Ok(())
}

fn read_spl_token_account(ai: &AccountInfo, token_program: &Pubkey) -> Result<SplTokenAccount> {
    require!(*ai.owner == *token_program, RewardsError::BadTokenAccountOwner);
    let data = ai.try_borrow_data()?;
    SplTokenAccount::unpack(&data).map_err(|_| error!(RewardsError::BadTokenAccountData))
}

#[derive(Accounts)]
pub struct InitRewardsConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + RewardsConfig::SIZE,
        seeds = [b"rewards_config"],
        bump
    )]
    pub rewards_config: Account<'info, RewardsConfig>,

    /// CHECK: validated in-program (must be owned by SPL Token program)
    pub toll_mint: UncheckedAccount<'info>,

    /// CHECK: PDA created as 0-data system account, used as SPL token authority signer.
    #[account(mut, seeds = [b"treasury_authority"], bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub treasury_vault: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateRewardsConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"rewards_config"],
        bump = rewards_config.bump,
        has_one = authority
    )]
    pub rewards_config: Account<'info, RewardsConfig>,
}

#[derive(Accounts)]
#[instruction(fqdn: String, domain_hash: [u8;32], nonce: [u8;16])]
pub struct StartDomainChallenge<'info> {
    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + DomainChallenge::SIZE,
        seeds = [b"challenge", domain_hash.as_ref(), nonce.as_ref()],
        bump
    )]
    pub domain_challenge: Account<'info, DomainChallenge>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(fqdn: String, domain_hash: [u8;32], nonce: [u8;16])]
pub struct ClaimDomain<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(
        mut,
        seeds = [b"challenge", domain_hash.as_ref(), nonce.as_ref()],
        bump = domain_challenge.bump,
        close = authority
    )]
    pub domain_challenge: Account<'info, DomainChallenge>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + DomainClaim::SIZE,
        seeds = [b"domain", domain_hash.as_ref()],
        bump
    )]
    pub domain_claim: Account<'info, DomainClaim>,

    /// CHECK: Must match domain_challenge.owner_wallet; asserted in handler.
    pub owner_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeDomainClaim<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"domain", domain_claim.domain_hash.as_ref()],
        bump = domain_claim.bump,
        constraint = domain_claim.owner_wallet == owner.key() @ RewardsError::OwnerMismatch
    )]
    pub domain_claim: Account<'info, DomainClaim>,
}

#[derive(Accounts)]
pub struct PayToll<'info> {
    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub payer_toll_ata: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(domain_hash: [u8;32])]
pub struct PayTollWithDomain<'info> {
    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub payer_toll_ata: UncheckedAccount<'info>,

    #[account(
        seeds = [b"domain", domain_hash.as_ref()],
        bump = domain_claim.bump
    )]
    pub domain_claim: Account<'info, DomainClaim>,

    /// CHECK: validated in-program (SPL token account; mint)
    #[account(mut)]
    pub domain_owner_payout_ata: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub authority_toll_ata: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, domain_hash: [u8;32])]
pub struct SubmitDomainUsage<'info> {
    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        seeds = [b"domain", domain_hash.as_ref()],
        bump = domain_claim.bump
    )]
    pub domain_claim: Account<'info, DomainClaim>,

    #[account(
        init,
        payer = submitter,
        space = 8 + DomainUsageEpoch::SIZE,
        seeds = [b"usage", domain_hash.as_ref(), epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub domain_usage_epoch: Account<'info, DomainUsageEpoch>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, domain_hash: [u8;32])]
pub struct ClaimDomainRewards<'info> {
    #[account(seeds = [b"rewards_config"], bump = rewards_config.bump)]
    pub rewards_config: Account<'info, RewardsConfig>,

    pub owner: Signer<'info>,

    #[account(
        seeds = [b"domain", domain_hash.as_ref()],
        bump = domain_claim.bump
    )]
    pub domain_claim: Account<'info, DomainClaim>,

    #[account(
        mut,
        seeds = [b"usage", domain_hash.as_ref(), epoch_id.to_le_bytes().as_ref()],
        bump = domain_usage_epoch.bump
    )]
    pub domain_usage_epoch: Account<'info, DomainUsageEpoch>,

    /// CHECK: PDA that owns treasury_vault; used as signer in token CPI.
    #[account(seeds = [b"treasury_authority"], bump = rewards_config.treasury_authority_bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub owner_toll_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct RewardsConfig {
    pub authority: Pubkey,
    pub toll_mint: Pubkey,
    pub treasury_vault: Pubkey,
    pub treasury_authority_bump: u8,
    pub domain_share_bps: u16,
    pub epoch_reward_bps: u16,
    pub min_toll_amount: u64,
    pub epoch_len_slots: u64,
    pub max_reward_per_epoch_per_domain: u64,
    pub min_unique_wallets: u32,
    pub challenge_ttl_slots: u64,
    pub enabled: bool,
    pub verifiers: Vec<Pubkey>,
    pub bump: u8,
}

impl RewardsConfig {
    pub const SIZE: usize = 32
        + 32
        + 32
        + 1
        + 2
        + 2
        + 8
        + 8
        + 8
        + 4
        + 8
        + 1
        + 4
        + (32 * MAX_VERIFIERS)
        + 1;
}

#[repr(u8)]
pub enum DomainClaimStatus {
    Unverified = 0,
    Verified = 1,
    Revoked = 2,
}

#[account]
pub struct DomainClaim {
    pub domain_hash: [u8; 32],
    pub fqdn_len: u8,
    pub fqdn_bytes: [u8; 253],
    pub owner_wallet: Pubkey,
    pub payout_token_account: Pubkey,
    pub status: u8,
    pub verified_at_slot: u64,
    pub bump: u8,
}

impl DomainClaim {
    pub const SIZE: usize = 32 + 1 + 253 + 32 + 32 + 1 + 8 + 1;
}

#[account]
pub struct DomainChallenge {
    pub domain_hash: [u8; 32],
    pub owner_wallet: Pubkey,
    pub nonce: [u8; 16],
    pub expires_at_slot: u64,
    pub bump: u8,
}

impl DomainChallenge {
    pub const SIZE: usize = 32 + 32 + 16 + 8 + 1;
}

#[account]
pub struct DomainUsageEpoch {
    pub domain_hash: [u8; 32],
    pub epoch_id: u64,
    pub paid_toll_amount: u64,
    pub query_count: u64,
    pub unique_wallet_count: u32,
    pub aggregate_root: [u8; 32],
    pub submitted_by: Pubkey,
    pub submitted_at_slot: u64,
    pub rewarded_amount: u64,
    pub rewarded_at_slot: u64,
    pub bump: u8,
}

impl DomainUsageEpoch {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 4 + 32 + 32 + 8 + 8 + 8 + 1;
}

#[error_code]
pub enum RewardsError {
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Too many verifiers in allowlist.")]
    TooManyVerifiers,
    #[msg("Not an authorized verifier/miner.")]
    NotVerifier,
    #[msg("Bad basis points value.")]
    BadBps,
    #[msg("Bad epoch length.")]
    BadEpochLen,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Bad amount.")]
    BadAmount,
    #[msg("Toll amount is below the configured minimum.")]
    BelowMinToll,
    #[msg("FQDN is invalid or out of range.")]
    BadFqdn,
    #[msg("Domain hash mismatch.")]
    DomainHashMismatch,
    #[msg("Challenge expired.")]
    ChallengeExpired,
    #[msg("Challenge mismatch.")]
    ChallengeMismatch,
    #[msg("Owner wallet mismatch.")]
    OwnerMismatch,
    #[msg("Claim is not verified.")]
    ClaimNotVerified,
    #[msg("Claim is revoked.")]
    ClaimRevoked,
    #[msg("Bad claim status.")]
    BadClaimStatus,
    #[msg("Payout ATA mismatch.")]
    PayoutAtaMismatch,
    #[msg("Wrong epoch.")]
    WrongEpoch,
    #[msg("Not enough unique wallets.")]
    NotEnoughUniqueWallets,
    #[msg("Nothing to claim.")]
    NothingToClaim,
    #[msg("Already rewarded for this epoch.")]
    AlreadyRewarded,
    #[msg("Rewards are disabled.")]
    RewardsDisabled,
    #[msg("Bad mint.")]
    BadMint,
    #[msg("Source token-account owner mismatch.")]
    BadPayerAtaOwner,
    #[msg("Bad treasury vault account.")]
    BadTreasuryVault,
    #[msg("Treasury vault token-account owner mismatch.")]
    BadTreasuryVaultOwner,
    #[msg("Treasury authority PDA already exists.")]
    TreasuryAuthorityAlreadyExists,
    #[msg("Treasury vault account already exists.")]
    TreasuryVaultAlreadyExists,
    #[msg("Mint account is not owned by the SPL Token program.")]
    BadMintOwner,
    #[msg("Token account owner is not SPL Token program.")]
    BadTokenAccountOwner,
    #[msg("Token account data is invalid.")]
    BadTokenAccountData,
}
