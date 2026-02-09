use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use sha2::{Digest, Sha256};
use anchor_spl::token::{self, Token, Transfer};
use anchor_spl::token::spl_token::state::{Account as SplTokenAccount, Mint as SplMint};

declare_id!("9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes");

#[program]
pub mod ddns_anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, version: u16) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if config.initialized {
            return err!(ErrorCode::AlreadyInitialized);
        }
        config.admin = ctx.accounts.admin.key();
        config.version = version;
        config.bump = ctx.bumps.config;
        config.initialized = true;
        Ok(())
    }

    pub fn set_version(ctx: Context<SetVersion>, version: u16) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_eq!(config.admin, ctx.accounts.admin.key(), ErrorCode::Unauthorized);
        config.version = version;
        Ok(())
    }

    pub fn issue_toll_pass(
        ctx: Context<IssueTollPass>,
        label: String,
        name_hash: [u8; 32],
        page_cid_hash: [u8; 32],
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        validate_label(&label)?;
        let computed = hash_label_dns(&label);
        require!(computed == name_hash, ErrorCode::InvalidNameHash);

        // Centralized MVP authority: all mints must be signed by config.admin (tollbooth).
        require_keys_eq!(
            ctx.accounts.config.admin,
            ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        // Ensure the "soulbound" mint is actually controlled by the authority signer.
        require_keys_eq!(
            *ctx.accounts.nft_mint.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidMintOwner
        );
        require_keys_eq!(
            *ctx.accounts.nft_token_account.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidTokenAccountOwner
        );

        {
            // Keep borrows scoped so CPI below can re-borrow safely.
            let mint_ai = ctx.accounts.nft_mint.to_account_info();
            let mint_data = mint_ai.try_borrow_data()?;
            let mint_state = SplMint::unpack(&mint_data)?;
            match mint_state.mint_authority {
                COption::Some(k) => {
                    require_keys_eq!(k, ctx.accounts.authority.key(), ErrorCode::Unauthorized)
                }
                COption::None => return err!(ErrorCode::Unauthorized),
            }
            match mint_state.freeze_authority {
                COption::Some(k) => {
                    require_keys_eq!(k, ctx.accounts.authority.key(), ErrorCode::Unauthorized)
                }
                COption::None => return err!(ErrorCode::Unauthorized),
            }
        }
        {
            let token_ai = ctx.accounts.nft_token_account.to_account_info();
            let token_data = token_ai.try_borrow_data()?;
            let token_state = SplTokenAccount::unpack(&token_data)?;
            require_keys_eq!(token_state.mint, ctx.accounts.nft_mint.key(), ErrorCode::Unauthorized);
            require_keys_eq!(token_state.owner, ctx.accounts.owner_wallet.key(), ErrorCode::Unauthorized);
        }

        let pass = &mut ctx.accounts.toll_pass;
        pass.owner = ctx.accounts.owner_wallet.key();
        pass.issued_at = Clock::get()?.unix_timestamp;
        pass.name_hash = name_hash;
        pass.owner_mint = ctx.accounts.nft_mint.key();
        pass.page_cid_hash = page_cid_hash;
        pass.metadata_hash = metadata_hash;
        pass.bump = ctx.bumps.toll_pass;
        pass.initialized = true;

        // Name ownership claim. `init` enforces global uniqueness for `name_hash`.
        let name_record = &mut ctx.accounts.name_record;
        name_record.name_hash = name_hash;
        name_record.owner_wallet = ctx.accounts.owner_wallet.key();
        name_record.owner_mint = ctx.accounts.nft_mint.key();
        let mut label_len = 0u8;
        write_label(&label, &mut name_record.label_bytes, &mut label_len)?;
        name_record.label_len = label_len;
        name_record.created_at = Clock::get()?.unix_timestamp;
        name_record.bump = ctx.bumps.name_record;

        // Mint soulbound NFT
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.nft_mint.to_account_info(),
                    to: ctx.accounts.nft_token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            1,
        )?;

        token::freeze_account(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::FreezeAccount {
                account: ctx.accounts.nft_token_account.to_account_info(),
                mint: ctx.accounts.nft_mint.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ))?;
        Ok(())
    }

    pub fn lock_tokens(ctx: Context<LockTokens>, amount: u64, lock_days: u16) -> Result<()> {
        require!(lock_days >= 30, ErrorCode::LockTooShort);
        let lock = &mut ctx.accounts.lock;
        if lock.initialized {
            return err!(ErrorCode::AlreadyInitialized);
        }
        require_keys_eq!(
            *ctx.accounts.mint.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidMintOwner
        );
        require_keys_eq!(
            *ctx.accounts.owner_token_account.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidTokenAccountOwner
        );
        require_keys_eq!(
            *ctx.accounts.vault.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidTokenAccountOwner
        );
        lock.owner = ctx.accounts.owner.key();
        lock.mint = ctx.accounts.mint.key();
        lock.vault = ctx.accounts.vault.key();
        lock.amount = amount;
        lock.locked_at = Clock::get()?.unix_timestamp;
        lock.unlock_at = lock.locked_at + (lock_days as i64) * 86_400;
        lock.bump = ctx.bumps.lock;
        lock.vault_bump = ctx.bumps.vault_authority;
        lock.initialized = true;

        let cpi_accounts = Transfer {
            from: ctx.accounts.owner_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;
        Ok(())
    }

    pub fn unlock_tokens(ctx: Context<UnlockTokens>) -> Result<()> {
        let lock = &mut ctx.accounts.lock;
        require_keys_eq!(lock.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require!(Clock::get()?.unix_timestamp >= lock.unlock_at, ErrorCode::LockNotExpired);
        require_keys_eq!(
            *ctx.accounts.mint.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidMintOwner
        );
        require_keys_eq!(
            *ctx.accounts.owner_token_account.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidTokenAccountOwner
        );
        require_keys_eq!(
            *ctx.accounts.vault.owner,
            ctx.accounts.token_program.key(),
            ErrorCode::InvalidTokenAccountOwner
        );
        let vault_authority_seeds: &[&[u8]] = &[
            b"vault_auth",
            lock.owner.as_ref(),
            &[lock.vault_bump],
        ];
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[vault_authority_seeds]),
            lock.amount,
        )?;

        lock.amount = 0;
        lock.unlock_at = 0;
        Ok(())
    }

    pub fn set_route(
        ctx: Context<SetRoute>,
        name: String,
        name_hash: [u8; 32],
        dest_hash: [u8; 32],
        ttl: u32,
    ) -> Result<()> {
        // Deterministic name hashing: sha256(lowercase(name)).
        // For MVP, require `.dns` and validate the label portion against [a-z0-9-]{3,32}.
        let normalized = name.trim().to_ascii_lowercase();
        require!(normalized.ends_with(".dns"), ErrorCode::InvalidNameChars);
        let label = match normalized.strip_suffix(".dns") {
            Some(v) => v,
            None => return err!(ErrorCode::InvalidNameChars),
        };
        validate_label(label)?;
        let computed = hash_full_name(&normalized);
        require!(computed == name_hash, ErrorCode::InvalidNameHash);

        // Centralized MVP authority: all writes must be signed by config.admin (tollbooth).
        require_keys_eq!(
            ctx.accounts.config.admin,
            ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        require!(ctx.accounts.toll_pass.initialized, ErrorCode::Unauthorized);
        require_keys_eq!(
            ctx.accounts.toll_pass.owner,
            ctx.accounts.owner_wallet.key(),
            ErrorCode::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.name_record.owner_wallet,
            ctx.accounts.owner_wallet.key(),
            ErrorCode::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.name_record.owner_mint,
            ctx.accounts.toll_pass.owner_mint,
            ErrorCode::Unauthorized
        );

        let record = &mut ctx.accounts.route_record;
        record.owner = ctx.accounts.owner_wallet.key();
        record.name_hash = name_hash;
        record.dest_hash = dest_hash;
        record.ttl = ttl;
        record.updated_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.route_record;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::SIZE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetVersion<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(label: String, name_hash: [u8; 32])]
pub struct IssueTollPass<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = 8 + TollPass::SIZE,
        seeds = [b"toll_pass", owner_wallet.key().as_ref()],
        bump
    )]
    pub toll_pass: Account<'info, TollPass>,

    #[account(
        init,
        payer = authority,
        space = 8 + NameRecord::SIZE,
        seeds = [b"name", name_hash.as_ref()],
        bump
    )]
    pub name_record: Account<'info, NameRecord>,

    /// CHECK: Pre-created mint for the NFT
    #[account(mut)]
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: Pre-created token account for the NFT
    #[account(mut)]
    pub nft_token_account: UncheckedAccount<'info>,

    pub owner_wallet: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct LockTokens<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + TokenLock::SIZE,
        seeds = [b"lock", owner.key().as_ref()],
        bump
    )]
    pub lock: Account<'info, TokenLock>,

    /// CHECK: Pre-created mint account
    pub mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Pre-created owner token account
    #[account(mut)]
    pub owner_token_account: UncheckedAccount<'info>,

    /// CHECK: Pre-created vault token account
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: PDA authority for vault token account
    #[account(seeds = [b"vault_auth", owner.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    #[account(
        mut,
        seeds = [b"lock", owner.key().as_ref()],
        bump = lock.bump
    )]
    pub lock: Account<'info, TokenLock>,

    /// CHECK: Pre-created mint account
    pub mint: UncheckedAccount<'info>,

    pub owner: Signer<'info>,

    /// CHECK: Pre-created owner token account
    #[account(mut)]
    pub owner_token_account: UncheckedAccount<'info>,

    /// CHECK: Pre-created vault token account
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: PDA authority for vault token account
    #[account(seeds = [b"vault_auth", owner.key().as_ref()], bump = lock.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(name: String, name_hash: [u8; 32])]
pub struct SetRoute<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + RouteRecord::SIZE,
        seeds = [b"record", owner_wallet.key().as_ref(), name_hash.as_ref()],
        bump
    )]
    pub route_record: Account<'info, RouteRecord>,

    #[account(
        seeds = [b"name", name_hash.as_ref()],
        bump = name_record.bump
    )]
    pub name_record: Account<'info, NameRecord>,

    #[account(
        seeds = [b"toll_pass", owner_wallet.key().as_ref()],
        bump = toll_pass.bump
    )]
    pub toll_pass: Account<'info, TollPass>,

    pub owner_wallet: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub version: u16,
    pub bump: u8,
    pub initialized: bool,
}

impl Config {
    pub const SIZE: usize = 32 + 2 + 1 + 1;
}

#[account]
pub struct TollPass {
    pub owner: Pubkey,
    pub issued_at: i64,
    pub name_hash: [u8; 32],
    pub owner_mint: Pubkey,
    pub page_cid_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub bump: u8,
    pub initialized: bool,
}

impl TollPass {
    pub const SIZE: usize = 32 + 8 + 32 + 32 + 32 + 32 + 1 + 1;
}

#[account]
pub struct TokenLock {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub locked_at: i64,
    pub unlock_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub initialized: bool,
}

impl TokenLock {
    pub const SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1;
}

#[account]
pub struct NameRecord {
    pub name_hash: [u8; 32],
    pub label_len: u8,
    pub label_bytes: [u8; 32],
    pub owner_mint: Pubkey,
    pub owner_wallet: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

impl NameRecord {
    pub const SIZE: usize = 32 + 1 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct RouteRecord {
    pub owner: Pubkey,
    pub name_hash: [u8; 32],
    pub dest_hash: [u8; 32],
    pub ttl: u32,
    pub updated_at: i64,
    pub bump: u8,
}

impl RouteRecord {
    pub const SIZE: usize = 32 + 32 + 32 + 4 + 8 + 1;
}

fn hash_label_dns(label: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(label.as_bytes());
    hasher.update(b".dns");
    hasher.finalize().into()
}

fn hash_full_name(name: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    hasher.finalize().into()
}

fn validate_label(label: &str) -> Result<()> {
    let bytes = label.as_bytes();
    if bytes.len() < 3 || bytes.len() > 32 {
        return err!(ErrorCode::InvalidNameLength);
    }
    if bytes[0] == b'-' || bytes[bytes.len() - 1] == b'-' {
        return err!(ErrorCode::InvalidNameChars);
    }
    for b in bytes {
        let ok = (b'a'..=b'z').contains(b) || (b'0'..=b'9').contains(b) || *b == b'-';
        if !ok {
            return err!(ErrorCode::InvalidNameChars);
        }
    }
    // bytes validation above enforces lowercase-only.
    if is_reserved(label) {
        return err!(ErrorCode::ReservedName);
    }
    Ok(())
}

fn write_label(label: &str, out: &mut [u8; 32], len_out: &mut u8) -> Result<()> {
    let bytes = label.as_bytes();
    out.fill(0);
    out[..bytes.len()].copy_from_slice(bytes);
    *len_out = bytes.len() as u8;
    Ok(())
}

fn is_reserved(name: &str) -> bool {
    matches!(name, "fuck" | "shit" | "cunt" | "bitch" | "ass")
}

#[error_code]
pub enum ErrorCode {
    #[msg("Config already initialized")]
    AlreadyInitialized,
    #[msg("Missing PDA bump")]
    MissingBump,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Lock period too short")]
    LockTooShort,
    #[msg("Lock not expired")]
    LockNotExpired,
    #[msg("Invalid name length")]
    InvalidNameLength,
    #[msg("Invalid name characters")]
    InvalidNameChars,
    #[msg("Name hash does not match name")]
    InvalidNameHash,
    #[msg("Reserved name")]
    ReservedName,
    #[msg("NFT mint is not owned by token program")]
    InvalidMintOwner,
    #[msg("NFT token account is not owned by token program")]
    InvalidTokenAccountOwner,
}
