use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
use sha2::{Digest, Sha256};

const MAX_PARENT_ZONE: usize = 64;

const KIND_PREMIUM: u8 = 1;
const KIND_SUBDOMAIN: u8 = 2;

const TRANSFER_NON_TRANSFERABLE: u8 = 0;
const TRANSFER_PARENT_CONTROLLED: u8 = 1;

const SEED_CONFIG: &[u8] = b"names_config";
const SEED_PREMIUM: &[u8] = b"premium";
const SEED_SUB: &[u8] = b"sub";
const SEED_PRIMARY: &[u8] = b"primary";
const SEED_POLICY: &[u8] = b"parent_policy";

// `solana-keygen pubkey solana/target/deploy/ddns_names-keypair.json`
declare_id!("9VLXME6bCbwwtdB2AbJN36TMAu3JKAtuZu44sF5hAJ44");

#[program]
pub mod ddns_names {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn init_names_config(
        ctx: Context<InitNamesConfig>,
        treasury_pubkey: Pubkey,
        parent_zone: String,
        premium_price_lamports: u64,
        subdomain_bond_lamports: u64,
        enable_subdomains: bool,
        enable_premium: bool,
    ) -> Result<()> {
        let normalized_parent = normalize_full_name(&parent_zone)?;
        require!(normalized_parent.ends_with(".dns"), NamesError::InvalidName);
        require!(normalized_parent.len() <= MAX_PARENT_ZONE, NamesError::InvalidName);

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.treasury = treasury_pubkey;
        cfg.parent_zone_hash = hash_name(&normalized_parent);
        cfg.parent_zone_len = normalized_parent.len() as u8;
        cfg.parent_zone_bytes = [0u8; MAX_PARENT_ZONE];
        cfg.parent_zone_bytes[..normalized_parent.len()].copy_from_slice(normalized_parent.as_bytes());
        cfg.premium_price_lamports = premium_price_lamports;
        cfg.subdomain_bond_lamports = subdomain_bond_lamports;
        cfg.enable_subdomains = enable_subdomains;
        cfg.enable_premium = enable_premium;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn claim_subdomain(
        ctx: Context<ClaimSubdomain>,
        parent: String,
        label: String,
        parent_hash: [u8; 32],
        label_hash: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(cfg.enable_subdomains, NamesError::Disabled);

        let normalized_parent = normalize_full_name(&parent)?;
        require!(normalized_parent == cfg.parent_zone(), NamesError::InvalidParent);

        let normalized_label = normalize_label(&label)?;
        let computed_parent = hash_name(&normalized_parent);
        let computed_label = hash_label(&normalized_label);
        require!(computed_parent == parent_hash, NamesError::InvalidHash);
        require!(computed_label == label_hash, NamesError::InvalidHash);

        if cfg.subdomain_bond_lamports > 0 {
            anchor_lang::solana_program::program::invoke(
                &system_instruction::transfer(
                    &ctx.accounts.owner.key(),
                    &cfg.treasury,
                    cfg.subdomain_bond_lamports,
                ),
                &[
                    ctx.accounts.owner.to_account_info(),
                    ctx.accounts.treasury.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

        let sub = &mut ctx.accounts.sub_name;
        sub.parent_hash = parent_hash;
        sub.label_hash = label_hash;
        sub.owner = ctx.accounts.owner.key();
        sub.transfer_policy = TRANSFER_NON_TRANSFERABLE;
        sub.parent_owner = Pubkey::default();
        sub.transfers_enabled = false;
        sub.created_at = Clock::get()?.unix_timestamp;
        sub.bump = ctx.bumps.sub_name;

        upsert_primary_if_empty(
            &mut ctx.accounts.primary,
            ctx.accounts.owner.key(),
            subdomain_name_hash(parent_hash, label_hash),
            KIND_SUBDOMAIN,
            ctx.bumps.primary,
        );

        Ok(())
    }

    pub fn purchase_premium(
        ctx: Context<PurchasePremium>,
        name: String,
        name_hash: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(cfg.enable_premium, NamesError::Disabled);

        let normalized = normalize_full_name(&name)?;
        let label = premium_label(&normalized)?;
        validate_label(label)?;
        let computed = hash_name(&normalized);
        require!(computed == name_hash, NamesError::InvalidHash);

        anchor_lang::solana_program::program::invoke(
            &system_instruction::transfer(&ctx.accounts.owner.key(), &cfg.treasury, cfg.premium_price_lamports),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let premium = &mut ctx.accounts.premium_name;
        premium.name_hash = name_hash;
        premium.owner = ctx.accounts.owner.key();
        premium.purchase_lamports = cfg.premium_price_lamports;
        premium.created_at = Clock::get()?.unix_timestamp;
        premium.transferable = true;
        premium.bump = ctx.bumps.premium_name;

        let policy = &mut ctx.accounts.parent_policy;
        policy.parent_hash = name_hash;
        policy.parent_owner = ctx.accounts.owner.key();
        policy.transfers_enabled = false;
        policy.bump = ctx.bumps.parent_policy;

        upsert_primary_if_empty(
            &mut ctx.accounts.primary,
            ctx.accounts.owner.key(),
            name_hash,
            KIND_PREMIUM,
            ctx.bumps.primary,
        );

        Ok(())
    }

    pub fn transfer_premium(ctx: Context<TransferPremium>) -> Result<()> {
        let premium = &mut ctx.accounts.premium_name;
        require_keys_eq!(premium.owner, ctx.accounts.current_owner.key(), NamesError::Unauthorized);
        premium.owner = ctx.accounts.new_owner.key();

        if ctx.accounts.parent_policy.parent_owner == ctx.accounts.current_owner.key() {
            ctx.accounts.parent_policy.parent_owner = ctx.accounts.new_owner.key();
        }
        Ok(())
    }

    pub fn claim_delegated_subdomain(
        ctx: Context<ClaimDelegatedSubdomain>,
        parent: String,
        label: String,
        parent_hash: [u8; 32],
        label_hash: [u8; 32],
        initial_owner: Pubkey,
    ) -> Result<()> {
        let normalized_parent = normalize_full_name(&parent)?;
        let normalized_label = normalize_label(&label)?;
        let computed_parent = hash_name(&normalized_parent);
        let computed_label = hash_label(&normalized_label);
        require!(computed_parent == parent_hash, NamesError::InvalidHash);
        require!(computed_label == label_hash, NamesError::InvalidHash);

        let premium = &ctx.accounts.premium_parent;
        require!(premium.name_hash == parent_hash, NamesError::InvalidParent);
        require_keys_eq!(premium.owner, ctx.accounts.parent_owner.key(), NamesError::Unauthorized);

        let policy = &mut ctx.accounts.parent_policy;
        if policy.parent_hash == [0u8; 32] {
            policy.parent_hash = parent_hash;
            policy.parent_owner = ctx.accounts.parent_owner.key();
            policy.transfers_enabled = false;
            policy.bump = ctx.bumps.parent_policy;
        } else {
            require!(policy.parent_hash == parent_hash, NamesError::InvalidParent);
            require_keys_eq!(policy.parent_owner, ctx.accounts.parent_owner.key(), NamesError::Unauthorized);
        }

        let sub = &mut ctx.accounts.sub_name;
        sub.parent_hash = parent_hash;
        sub.label_hash = label_hash;
        sub.owner = initial_owner;
        sub.transfer_policy = TRANSFER_PARENT_CONTROLLED;
        sub.parent_owner = ctx.accounts.parent_owner.key();
        sub.transfers_enabled = policy.transfers_enabled;
        sub.created_at = Clock::get()?.unix_timestamp;
        sub.bump = ctx.bumps.sub_name;

        Ok(())
    }

    pub fn set_parent_subdomain_policy(
        ctx: Context<SetParentSubdomainPolicy>,
        parent: String,
        parent_hash: [u8; 32],
        transfers_enabled: bool,
    ) -> Result<()> {
        let normalized_parent = normalize_full_name(&parent)?;
        let computed_parent = hash_name(&normalized_parent);
        require!(computed_parent == parent_hash, NamesError::InvalidHash);
        require!(ctx.accounts.premium_parent.name_hash == parent_hash, NamesError::InvalidParent);
        require_keys_eq!(ctx.accounts.premium_parent.owner, ctx.accounts.parent_owner.key(), NamesError::Unauthorized);

        let policy = &mut ctx.accounts.parent_policy;
        if policy.parent_hash == [0u8; 32] {
            policy.parent_hash = parent_hash;
            policy.parent_owner = ctx.accounts.parent_owner.key();
            policy.bump = ctx.bumps.parent_policy;
        } else {
            require!(policy.parent_hash == parent_hash, NamesError::InvalidParent);
            require_keys_eq!(policy.parent_owner, ctx.accounts.parent_owner.key(), NamesError::Unauthorized);
        }
        policy.transfers_enabled = transfers_enabled;
        Ok(())
    }

    pub fn transfer_subdomain(
        ctx: Context<TransferSubdomain>,
        parent: String,
        label: String,
        parent_hash: [u8; 32],
        label_hash: [u8; 32],
    ) -> Result<()> {
        let normalized_parent = normalize_full_name(&parent)?;
        let normalized_label = normalize_label(&label)?;
        require!(hash_name(&normalized_parent) == parent_hash, NamesError::InvalidHash);
        require!(hash_label(&normalized_label) == label_hash, NamesError::InvalidHash);

        let sub = &mut ctx.accounts.sub_name;
        require!(sub.parent_hash == parent_hash && sub.label_hash == label_hash, NamesError::InvalidHash);
        require_keys_eq!(sub.owner, ctx.accounts.current_owner.key(), NamesError::Unauthorized);

        match sub.transfer_policy {
            TRANSFER_NON_TRANSFERABLE => return err!(NamesError::NonTransferable),
            TRANSFER_PARENT_CONTROLLED => {
                let allowed_by_toggle = ctx
                    .accounts
                    .parent_policy
                    .as_ref()
                    .map(|p| p.transfers_enabled)
                    .unwrap_or(false);
                if !allowed_by_toggle {
                    let parent_owner = ctx
                        .accounts
                        .parent_owner
                        .as_ref()
                        .ok_or_else(|| error!(NamesError::ParentOwnerRequired))?;
                    require_keys_eq!(sub.parent_owner, parent_owner.key(), NamesError::ParentOwnerRequired);
                }
            }
            _ => return err!(NamesError::InvalidTransferPolicy),
        }

        sub.owner = ctx.accounts.new_owner.key();
        Ok(())
    }

    pub fn set_primary_name(ctx: Context<SetPrimaryName>, name_hash: [u8; 32], kind: u8) -> Result<()> {
        match kind {
            KIND_PREMIUM => {
                let premium = ctx
                    .accounts
                    .premium_name
                    .as_ref()
                    .ok_or_else(|| error!(NamesError::MissingRequiredAccount))?;
                require!(premium.name_hash == name_hash, NamesError::InvalidHash);
                require_keys_eq!(premium.owner, ctx.accounts.owner.key(), NamesError::Unauthorized);
            }
            KIND_SUBDOMAIN => {
                let sub = ctx
                    .accounts
                    .sub_name
                    .as_ref()
                    .ok_or_else(|| error!(NamesError::MissingRequiredAccount))?;
                require_keys_eq!(sub.owner, ctx.accounts.owner.key(), NamesError::Unauthorized);
                let computed = subdomain_name_hash(sub.parent_hash, sub.label_hash);
                require!(computed == name_hash, NamesError::InvalidHash);
            }
            _ => return err!(NamesError::InvalidKind),
        }

        let primary = &mut ctx.accounts.primary;
        primary.owner = ctx.accounts.owner.key();
        primary.name_hash = name_hash;
        primary.kind = kind;
        primary.is_set = true;
        if primary.bump == 0 {
            primary.bump = ctx.bumps.primary;
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitNamesConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + NamesConfig::SIZE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, NamesConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(parent: String, label: String, parent_hash: [u8; 32], label_hash: [u8; 32])]
pub struct ClaimSubdomain<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, NamesConfig>,

    #[account(mut, address = config.treasury)]
    /// CHECK: validated by address constraint.
    pub treasury: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + SubName::SIZE,
        seeds = [SEED_SUB, parent_hash.as_ref(), label_hash.as_ref()],
        bump
    )]
    pub sub_name: Account<'info, SubName>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PrimaryName::SIZE,
        seeds = [SEED_PRIMARY, owner.key().as_ref()],
        bump
    )]
    pub primary: Account<'info, PrimaryName>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, name_hash: [u8; 32])]
pub struct PurchasePremium<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, NamesConfig>,

    #[account(mut, address = config.treasury)]
    /// CHECK: validated by address constraint.
    pub treasury: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + PremiumName::SIZE,
        seeds = [SEED_PREMIUM, name_hash.as_ref()],
        bump
    )]
    pub premium_name: Account<'info, PremiumName>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + ParentPolicy::SIZE,
        seeds = [SEED_POLICY, name_hash.as_ref()],
        bump
    )]
    pub parent_policy: Account<'info, ParentPolicy>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PrimaryName::SIZE,
        seeds = [SEED_PRIMARY, owner.key().as_ref()],
        bump
    )]
    pub primary: Account<'info, PrimaryName>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferPremium<'info> {
    #[account(mut)]
    pub premium_name: Account<'info, PremiumName>,

    #[account(
        mut,
        seeds = [SEED_POLICY, premium_name.name_hash.as_ref()],
        bump = parent_policy.bump,
        constraint = parent_policy.parent_hash == premium_name.name_hash @ NamesError::InvalidParent
    )]
    pub parent_policy: Account<'info, ParentPolicy>,

    #[account(mut)]
    pub current_owner: Signer<'info>,

    /// CHECK: new owner pubkey only.
    pub new_owner: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(parent: String, label: String, parent_hash: [u8; 32], label_hash: [u8; 32], initial_owner: Pubkey)]
pub struct ClaimDelegatedSubdomain<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, NamesConfig>,

    #[account(
        seeds = [SEED_PREMIUM, parent_hash.as_ref()],
        bump = premium_parent.bump
    )]
    pub premium_parent: Account<'info, PremiumName>,

    #[account(
        init_if_needed,
        payer = parent_owner,
        space = 8 + ParentPolicy::SIZE,
        seeds = [SEED_POLICY, parent_hash.as_ref()],
        bump
    )]
    pub parent_policy: Account<'info, ParentPolicy>,

    #[account(
        init,
        payer = parent_owner,
        space = 8 + SubName::SIZE,
        seeds = [SEED_SUB, parent_hash.as_ref(), label_hash.as_ref()],
        bump
    )]
    pub sub_name: Account<'info, SubName>,

    #[account(mut)]
    pub parent_owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(parent: String, parent_hash: [u8; 32], transfers_enabled: bool)]
pub struct SetParentSubdomainPolicy<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, NamesConfig>,

    #[account(
        seeds = [SEED_PREMIUM, parent_hash.as_ref()],
        bump = premium_parent.bump
    )]
    pub premium_parent: Account<'info, PremiumName>,

    #[account(
        init_if_needed,
        payer = parent_owner,
        space = 8 + ParentPolicy::SIZE,
        seeds = [SEED_POLICY, parent_hash.as_ref()],
        bump
    )]
    pub parent_policy: Account<'info, ParentPolicy>,

    #[account(mut)]
    pub parent_owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(parent: String, label: String, parent_hash: [u8; 32], label_hash: [u8; 32])]
pub struct TransferSubdomain<'info> {
    #[account(
        mut,
        seeds = [SEED_SUB, parent_hash.as_ref(), label_hash.as_ref()],
        bump = sub_name.bump
    )]
    pub sub_name: Account<'info, SubName>,

    #[account(mut)]
    pub current_owner: Signer<'info>,

    /// CHECK: destination wallet pubkey only.
    pub new_owner: UncheckedAccount<'info>,

    pub parent_owner: Option<Signer<'info>>,

    #[account(
        seeds = [SEED_POLICY, parent_hash.as_ref()],
        bump = parent_policy.bump
    )]
    pub parent_policy: Option<Account<'info, ParentPolicy>>,
}

#[derive(Accounts)]
pub struct SetPrimaryName<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PrimaryName::SIZE,
        seeds = [SEED_PRIMARY, owner.key().as_ref()],
        bump
    )]
    pub primary: Account<'info, PrimaryName>,

    pub premium_name: Option<Account<'info, PremiumName>>,
    pub sub_name: Option<Account<'info, SubName>>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct NamesConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub parent_zone_hash: [u8; 32],
    pub parent_zone_len: u8,
    pub parent_zone_bytes: [u8; MAX_PARENT_ZONE],
    pub premium_price_lamports: u64,
    pub subdomain_bond_lamports: u64,
    pub enable_subdomains: bool,
    pub enable_premium: bool,
    pub bump: u8,
}

impl NamesConfig {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + MAX_PARENT_ZONE + 8 + 8 + 1 + 1 + 1;

    pub fn parent_zone(&self) -> String {
        let len = self.parent_zone_len as usize;
        String::from_utf8_lossy(&self.parent_zone_bytes[..len]).to_string()
    }
}

#[account]
pub struct PremiumName {
    pub name_hash: [u8; 32],
    pub owner: Pubkey,
    pub purchase_lamports: u64,
    pub created_at: i64,
    pub transferable: bool,
    pub bump: u8,
}

impl PremiumName {
    pub const SIZE: usize = 32 + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct ParentPolicy {
    pub parent_hash: [u8; 32],
    pub parent_owner: Pubkey,
    pub transfers_enabled: bool,
    pub bump: u8,
}

impl ParentPolicy {
    pub const SIZE: usize = 32 + 32 + 1 + 1;
}

#[account]
pub struct SubName {
    pub parent_hash: [u8; 32],
    pub label_hash: [u8; 32],
    pub owner: Pubkey,
    pub transfer_policy: u8,
    pub parent_owner: Pubkey,
    pub transfers_enabled: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl SubName {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 32 + 1 + 8 + 1;
}

#[account]
pub struct PrimaryName {
    pub owner: Pubkey,
    pub name_hash: [u8; 32],
    pub kind: u8,
    pub is_set: bool,
    pub bump: u8,
}

impl PrimaryName {
    pub const SIZE: usize = 32 + 32 + 1 + 1 + 1;
}

fn upsert_primary_if_empty(primary: &mut Account<PrimaryName>, owner: Pubkey, name_hash: [u8; 32], kind: u8, bump: u8) {
    if !primary.is_set {
        primary.owner = owner;
        primary.name_hash = name_hash;
        primary.kind = kind;
        primary.is_set = true;
        primary.bump = bump;
    }
}

fn normalize_full_name(input: &str) -> Result<String> {
    let lower = input.trim().to_ascii_lowercase();
    let normalized = lower.trim_end_matches('.').to_string();
    require!(!normalized.is_empty() && normalized.len() <= 253, NamesError::InvalidName);
    require!(!normalized.contains(".."), NamesError::InvalidName);
    Ok(normalized)
}

fn normalize_label(input: &str) -> Result<String> {
    let label = input.trim().to_ascii_lowercase();
    validate_label(&label)?;
    Ok(label)
}

fn validate_label(label: &str) -> Result<()> {
    require!((3..=32).contains(&label.len()), NamesError::InvalidLabel);
    let bytes = label.as_bytes();
    require!(bytes[0] != b'-' && bytes[bytes.len() - 1] != b'-', NamesError::InvalidLabel);
    for &b in bytes {
        let ok = b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-';
        require!(ok, NamesError::InvalidLabel);
    }
    Ok(())
}

fn premium_label(normalized: &str) -> Result<&str> {
    require!(normalized.ends_with(".dns"), NamesError::InvalidName);
    let parts: Vec<&str> = normalized.split('.').collect();
    require!(parts.len() == 2, NamesError::InvalidName);
    Ok(parts[0])
}

fn hash_name(value: &str) -> [u8; 32] {
    let digest = Sha256::digest(value.as_bytes());
    digest.into()
}

fn hash_label(value: &str) -> [u8; 32] {
    let digest = Sha256::digest(value.as_bytes());
    digest.into()
}

fn subdomain_name_hash(parent_hash: [u8; 32], label_hash: [u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(parent_hash);
    h.update(label_hash);
    h.finalize().into()
}

#[error_code]
pub enum NamesError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid name")]
    InvalidName,
    #[msg("Invalid label")]
    InvalidLabel,
    #[msg("Invalid hash")]
    InvalidHash,
    #[msg("Invalid parent")]
    InvalidParent,
    #[msg("Feature disabled")]
    Disabled,
    #[msg("Subdomain is non-transferable")]
    NonTransferable,
    #[msg("Parent owner signature required")]
    ParentOwnerRequired,
    #[msg("Invalid transfer policy")]
    InvalidTransferPolicy,
    #[msg("Invalid name kind")]
    InvalidKind,
    #[msg("Missing required account")]
    MissingRequiredAccount,
}
