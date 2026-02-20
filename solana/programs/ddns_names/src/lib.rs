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
const SEED_PREMIUM_CONFIG: &[u8] = b"premium_config";
const SEED_AUCTION: &[u8] = b"auction";
const SEED_ESCROW: &[u8] = b"escrow";
const SEED_ESCROW_VAULT: &[u8] = b"escrow_vault";
const SEED_SUB: &[u8] = b"sub";
const SEED_PRIMARY: &[u8] = b"primary";
const SEED_POLICY: &[u8] = b"parent_policy";

// `solana-keygen pubkey solana/target/deploy/ddns_names-keypair.json`
declare_id!("AkABCWonPtbj8vpxef5GGBMdtWbLTo4p4ZnLR8rjYigB");

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
        let pcfg = &ctx.accounts.premium_config;
        require!(cfg.enable_premium && pcfg.enabled, NamesError::Disabled);
        let normalized = normalize_full_name(&name)?;
        let label = premium_label(&normalized)?;
        validate_premium_label(label)?;
        let computed = hash_name(&normalized);
        require!(computed == name_hash, NamesError::InvalidHash);
        let label_len = label.len() as u8;

        if label_len <= pcfg.reserved_max_len {
            require_keys_eq!(ctx.accounts.owner.key(), pcfg.treasury_authority, NamesError::ReservedName);
        } else if (pcfg.premium_min_len..=pcfg.premium_max_len).contains(&label_len) {
            return err!(NamesError::AuctionRequired);
        }

        if cfg.premium_price_lamports > 0 {
            anchor_lang::solana_program::program::invoke(
                &system_instruction::transfer(&ctx.accounts.owner.key(), &cfg.treasury, cfg.premium_price_lamports),
                &[
                    ctx.accounts.owner.to_account_info(),
                    ctx.accounts.treasury.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

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

    pub fn init_premium_config(
        ctx: Context<InitPremiumConfig>,
        treasury_vault: Pubkey,
        treasury_authority: Pubkey,
        min_bid_lamports_default: u64,
        auction_duration_slots_default: u64,
        anti_sniping_extension_slots: u64,
        enabled: bool,
    ) -> Result<()> {
        let pcfg = &mut ctx.accounts.premium_config;
        pcfg.authority = ctx.accounts.authority.key();
        pcfg.treasury_vault = treasury_vault;
        pcfg.treasury_authority = treasury_authority;
        pcfg.reserved_max_len = 2;
        pcfg.premium_min_len = 3;
        pcfg.premium_max_len = 4;
        pcfg.min_bid_lamports_default = min_bid_lamports_default;
        pcfg.auction_duration_slots_default = auction_duration_slots_default;
        pcfg.anti_sniping_extension_slots = anti_sniping_extension_slots;
        pcfg.enabled = enabled;
        pcfg.bump = ctx.bumps.premium_config;
        Ok(())
    }

    pub fn create_auction(
        ctx: Context<CreateAuction>,
        name: String,
        name_hash: [u8; 32],
        min_bid_lamports: Option<u64>,
        duration_slots: Option<u64>,
    ) -> Result<()> {
        let pcfg = &ctx.accounts.premium_config;
        require!(pcfg.enabled, NamesError::Disabled);
        require_keys_eq!(pcfg.authority, ctx.accounts.authority.key(), NamesError::Unauthorized);

        let normalized = normalize_full_name(&name)?;
        let label = premium_label(&normalized)?;
        validate_premium_label(label)?;
        let computed = hash_name(&normalized);
        require!(computed == name_hash, NamesError::InvalidHash);
        let label_len = label.len() as u8;
        require!(
            (pcfg.premium_min_len..=pcfg.premium_max_len).contains(&label_len),
            NamesError::InvalidAuctionDomain
        );

        let now_slot = Clock::get()?.slot;
        let min_bid = min_bid_lamports.unwrap_or(pcfg.min_bid_lamports_default);
        let duration = duration_slots.unwrap_or(pcfg.auction_duration_slots_default);
        require!(duration > 0, NamesError::InvalidAuctionConfig);

        let auction = &mut ctx.accounts.auction;
        auction.name_hash = name_hash;
        auction.start_slot = now_slot;
        auction.end_slot = now_slot
            .checked_add(duration)
            .ok_or_else(|| error!(NamesError::MathOverflow))?;
        auction.min_bid_lamports = min_bid;
        auction.highest_bidder = Pubkey::default();
        auction.highest_bid_lamports = 0;
        auction.settled = false;
        auction.bump = ctx.bumps.auction;
        Ok(())
    }

    pub fn place_bid(
        ctx: Context<PlaceBid>,
        name_hash: [u8; 32],
        lamports: u64,
    ) -> Result<()> {
        require!(lamports > 0, NamesError::InvalidBid);
        let pcfg = &ctx.accounts.premium_config;
        let auction = &mut ctx.accounts.auction;
        require!(pcfg.enabled && !auction.settled, NamesError::Disabled);
        require!(auction.name_hash == name_hash, NamesError::InvalidHash);

        let now_slot = Clock::get()?.slot;
        require!(now_slot < auction.end_slot, NamesError::AuctionClosed);

        let current_total = {
            let escrow = &mut ctx.accounts.bid_escrow;
            if escrow.bidder == Pubkey::default() {
                escrow.name_hash = name_hash;
                escrow.bidder = ctx.accounts.bidder.key();
                escrow.amount_lamports = 0;
                escrow.active = true;
                escrow.refunded = false;
                escrow.bump = ctx.bumps.bid_escrow;
            } else {
                require!(escrow.name_hash == name_hash, NamesError::InvalidHash);
                require_keys_eq!(escrow.bidder, ctx.accounts.bidder.key(), NamesError::Unauthorized);
                require!(escrow.active && !escrow.refunded, NamesError::EscrowInactive);
            }
            escrow.amount_lamports
        };

        let new_total = current_total
            .checked_add(lamports)
            .ok_or_else(|| error!(NamesError::MathOverflow))?;

        let min_required = auction
            .highest_bid_lamports
            .max(auction.min_bid_lamports)
            .checked_add(if auction.highest_bid_lamports > 0 { 1 } else { 0 })
            .ok_or_else(|| error!(NamesError::MathOverflow))?;
        require!(new_total >= min_required, NamesError::BidTooLow);

        anchor_lang::solana_program::program::invoke(
            &system_instruction::transfer(&ctx.accounts.bidder.key(), &ctx.accounts.escrow_vault.key(), lamports),
            &[
                ctx.accounts.bidder.to_account_info(),
                ctx.accounts.escrow_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        ctx.accounts.bid_escrow.amount_lamports = new_total;

        auction.highest_bidder = ctx.accounts.bidder.key();
        auction.highest_bid_lamports = new_total;

        if pcfg.anti_sniping_extension_slots > 0 {
            let remaining = auction.end_slot.saturating_sub(now_slot);
            if remaining <= pcfg.anti_sniping_extension_slots {
                auction.end_slot = auction
                    .end_slot
                    .checked_add(pcfg.anti_sniping_extension_slots)
                    .ok_or_else(|| error!(NamesError::MathOverflow))?;
            }
        }

        Ok(())
    }

    pub fn withdraw_losing_bid(
        ctx: Context<WithdrawLosingBid>,
        name_hash: [u8; 32],
    ) -> Result<()> {
        let auction = &ctx.accounts.auction;
        require!(auction.name_hash == name_hash, NamesError::InvalidHash);
        require!(!auction.settled || auction.highest_bidder != ctx.accounts.bidder.key(), NamesError::WinnerCannotWithdraw);
        require!(auction.highest_bidder != ctx.accounts.bidder.key(), NamesError::WinnerCannotWithdraw);

        let escrow = &ctx.accounts.bid_escrow;
        require!(escrow.name_hash == name_hash, NamesError::InvalidHash);
        require_keys_eq!(escrow.bidder, ctx.accounts.bidder.key(), NamesError::Unauthorized);
        require!(escrow.active && !escrow.refunded, NamesError::EscrowInactive);
        require!(escrow.amount_lamports > 0, NamesError::NothingToWithdraw);
        let amount = escrow.amount_lamports;
        let vault_info = ctx.accounts.escrow_vault.to_account_info();
        let bidder_info = ctx.accounts.bidder.to_account_info();
        let vault_balance = **vault_info.lamports.borrow();
        require!(vault_balance >= amount, NamesError::EscrowInsufficient);
        **vault_info.try_borrow_mut_lamports()? = vault_balance
            .checked_sub(amount)
            .ok_or_else(|| error!(NamesError::MathOverflow))?;
        **bidder_info.try_borrow_mut_lamports()? = (**bidder_info.lamports.borrow())
            .checked_add(amount)
            .ok_or_else(|| error!(NamesError::MathOverflow))?;
        Ok(())
    }

    pub fn settle_auction(
        ctx: Context<SettleAuction>,
        name_hash: [u8; 32],
    ) -> Result<()> {
        let pcfg = &ctx.accounts.premium_config;
        let auction = &mut ctx.accounts.auction;
        require!(auction.name_hash == name_hash, NamesError::InvalidHash);
        require!(!auction.settled, NamesError::AlreadySettled);
        require!(Clock::get()?.slot >= auction.end_slot, NamesError::AuctionNotEnded);
        require!(auction.highest_bid_lamports > 0, NamesError::NoWinningBid);
        require_keys_eq!(auction.highest_bidder, ctx.accounts.winner.key(), NamesError::Unauthorized);

        require!(ctx.accounts.treasury.key() == pcfg.treasury_vault, NamesError::InvalidTreasury);
        let premium = &mut ctx.accounts.premium_name;
        premium.name_hash = name_hash;
        premium.owner = ctx.accounts.winner.key();
        premium.purchase_lamports = auction.highest_bid_lamports;
        premium.created_at = Clock::get()?.unix_timestamp;
        premium.transferable = true;
        premium.bump = ctx.bumps.premium_name;

        let policy = &mut ctx.accounts.parent_policy;
        policy.parent_hash = name_hash;
        policy.parent_owner = ctx.accounts.winner.key();
        policy.transfers_enabled = false;
        policy.bump = ctx.bumps.parent_policy;

        upsert_primary_if_empty(
            &mut ctx.accounts.primary,
            ctx.accounts.winner.key(),
            name_hash,
            KIND_PREMIUM,
            ctx.bumps.primary,
        );

        auction.settled = true;
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

    #[account(seeds = [SEED_PREMIUM_CONFIG], bump = premium_config.bump)]
    pub premium_config: Account<'info, PremiumConfig>,

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

#[derive(Accounts)]
pub struct InitPremiumConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PremiumConfig::SIZE,
        seeds = [SEED_PREMIUM_CONFIG],
        bump
    )]
    pub premium_config: Account<'info, PremiumConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, name_hash: [u8; 32], min_bid_lamports: Option<u64>, duration_slots: Option<u64>)]
pub struct CreateAuction<'info> {
    #[account(seeds = [SEED_PREMIUM_CONFIG], bump = premium_config.bump)]
    pub premium_config: Account<'info, PremiumConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + Auction::SIZE,
        seeds = [SEED_AUCTION, name_hash.as_ref()],
        bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8; 32], lamports: u64)]
pub struct PlaceBid<'info> {
    #[account(seeds = [SEED_PREMIUM_CONFIG], bump = premium_config.bump)]
    pub premium_config: Account<'info, PremiumConfig>,
    #[account(
        mut,
        seeds = [SEED_AUCTION, name_hash.as_ref()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(
        init_if_needed,
        payer = bidder,
        space = 8 + BidEscrow::SIZE,
        seeds = [SEED_ESCROW, name_hash.as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid_escrow: Account<'info, BidEscrow>,
    #[account(
        init_if_needed,
        payer = bidder,
        space = 0,
        seeds = [SEED_ESCROW_VAULT, name_hash.as_ref(), bidder.key().as_ref()],
        bump
    )]
    /// CHECK: lamport vault PDA with zero data.
    pub escrow_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8; 32])]
pub struct WithdrawLosingBid<'info> {
    #[account(
        seeds = [SEED_AUCTION, name_hash.as_ref()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(seeds = [SEED_ESCROW, name_hash.as_ref(), bidder.key().as_ref()], bump = bid_escrow.bump)]
    pub bid_escrow: Account<'info, BidEscrow>,
    #[account(
        mut,
        seeds = [SEED_ESCROW_VAULT, name_hash.as_ref(), bidder.key().as_ref()],
        bump
    )]
    /// CHECK: lamport vault PDA with zero data.
    pub escrow_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8; 32])]
pub struct SettleAuction<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, NamesConfig>,
    #[account(seeds = [SEED_PREMIUM_CONFIG], bump = premium_config.bump)]
    pub premium_config: Account<'info, PremiumConfig>,
    #[account(
        mut,
        seeds = [SEED_AUCTION, name_hash.as_ref()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(mut, seeds = [SEED_ESCROW, name_hash.as_ref(), winner.key().as_ref()], bump)]
    /// CHECK: escrow checked off-chain in MVP settle path.
    pub winner_escrow: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_ESCROW_VAULT, name_hash.as_ref(), winner.key().as_ref()], bump)]
    /// CHECK: lamport vault PDA with zero data.
    pub winner_escrow_vault: UncheckedAccount<'info>,
    #[account(mut, address = premium_config.treasury_vault)]
    /// CHECK: validated by address constraint.
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init,
        payer = winner,
        space = 8 + PremiumName::SIZE,
        seeds = [SEED_PREMIUM, name_hash.as_ref()],
        bump
    )]
    pub premium_name: Account<'info, PremiumName>,
    #[account(
        init_if_needed,
        payer = winner,
        space = 8 + ParentPolicy::SIZE,
        seeds = [SEED_POLICY, name_hash.as_ref()],
        bump
    )]
    pub parent_policy: Account<'info, ParentPolicy>,
    #[account(
        init_if_needed,
        payer = winner,
        space = 8 + PrimaryName::SIZE,
        seeds = [SEED_PRIMARY, winner.key().as_ref()],
        bump
    )]
    pub primary: Account<'info, PrimaryName>,
    #[account(mut)]
    pub winner: Signer<'info>,
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

#[account]
pub struct PremiumConfig {
    pub authority: Pubkey,
    pub treasury_vault: Pubkey,
    pub treasury_authority: Pubkey,
    pub reserved_max_len: u8,
    pub premium_min_len: u8,
    pub premium_max_len: u8,
    pub min_bid_lamports_default: u64,
    pub auction_duration_slots_default: u64,
    pub anti_sniping_extension_slots: u64,
    pub enabled: bool,
    pub bump: u8,
}

impl PremiumConfig {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 1 + 1 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Auction {
    pub name_hash: [u8; 32],
    pub start_slot: u64,
    pub end_slot: u64,
    pub min_bid_lamports: u64,
    pub highest_bidder: Pubkey,
    pub highest_bid_lamports: u64,
    pub settled: bool,
    pub bump: u8,
}

impl Auction {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 32 + 8 + 1 + 1;
}

#[account]
pub struct BidEscrow {
    pub name_hash: [u8; 32],
    pub bidder: Pubkey,
    pub amount_lamports: u64,
    pub active: bool,
    pub refunded: bool,
    pub bump: u8,
}

impl BidEscrow {
    pub const SIZE: usize = 32 + 32 + 8 + 1 + 1 + 1;
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

fn validate_premium_label(label: &str) -> Result<()> {
    require!((1..=32).contains(&label.len()), NamesError::InvalidLabel);
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
    #[msg("Name reserved for treasury authority")]
    ReservedName,
    #[msg("Auction required for this premium domain")]
    AuctionRequired,
    #[msg("Invalid auction domain length")]
    InvalidAuctionDomain,
    #[msg("Invalid auction configuration")]
    InvalidAuctionConfig,
    #[msg("Auction has already closed")]
    AuctionClosed,
    #[msg("Bid is too low")]
    BidTooLow,
    #[msg("Invalid bid amount")]
    InvalidBid,
    #[msg("Bid escrow is inactive")]
    EscrowInactive,
    #[msg("Winning bidder cannot withdraw during active winner state")]
    WinnerCannotWithdraw,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Auction already settled")]
    AlreadySettled,
    #[msg("Auction has not ended")]
    AuctionNotEnded,
    #[msg("No winning bid present")]
    NoWinningBid,
    #[msg("Escrow balance is insufficient")]
    EscrowInsufficient,
    #[msg("Treasury account mismatch")]
    InvalidTreasury,
    #[msg("Math overflow")]
    MathOverflow,
}
