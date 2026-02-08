use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};
use anchor_spl::token::{self, SetAuthority, Token, Transfer};
#[cfg(feature = "metaplex")]
use mpl_token_metadata::instruction::{create_master_edition_v3, create_metadata_accounts_v3};
#[cfg(feature = "metaplex")]
use mpl_token_metadata::ID as METADATA_PROGRAM_ID;

declare_id!("2kE76PBfDwKvSsfBW9xMBxaor8AoEooVDA7DkGd8WVR1");

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
        name: String,
        page_cid_hash: [u8; 32],
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        validate_name(&name)?;
        let name_hash = hash_name(&name);

        let pass = &mut ctx.accounts.toll_pass;
        if pass.initialized {
            return err!(ErrorCode::AlreadyInitialized);
        }
        pass.owner = ctx.accounts.owner.key();
        pass.issued_at = Clock::get()?.unix_timestamp;
        pass.name_hash = name_hash;
        pass.page_cid_hash = page_cid_hash;
        pass.metadata_hash = metadata_hash;
        pass.bump = ctx.bumps.toll_pass;
        pass.initialized = true;

        let record = &mut ctx.accounts.record;
        if record.initialized {
            return err!(ErrorCode::AlreadyInitialized);
        }
        record.owner = ctx.accounts.owner.key();
        record.name_hash = name_hash;
        let mut name_len = 0u8;
        write_name(&name, &mut record.name_bytes, &mut name_len)?;
        record.name_len = name_len;
        record.page_cid_hash = page_cid_hash;
        record.metadata_hash = metadata_hash;
        record.updated_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.record;
        record.initialized = true;

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

        let mint_auth_bump = ctx.bumps.nft_mint_authority;
        // Mint soulbound NFT
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.nft_mint.to_account_info(),
                    to: ctx.accounts.nft_token_account.to_account_info(),
                    authority: ctx.accounts.nft_mint_authority.to_account_info(),
                },
                &[&[
                    b"nft_mint_auth",
                    ctx.accounts.owner.key().as_ref(),
                    &[mint_auth_bump],
                ]],
            ),
            1,
        )?;

        token::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::FreezeAccount {
                account: ctx.accounts.nft_token_account.to_account_info(),
                mint: ctx.accounts.nft_mint.to_account_info(),
                authority: ctx.accounts.nft_mint_authority.to_account_info(),
            },
            &[&[
                b"nft_mint_auth",
                ctx.accounts.owner.key().as_ref(),
                &[mint_auth_bump],
            ]],
        ))?;

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.nft_mint_authority.to_account_info(),
                    account_or_mint: ctx.accounts.nft_mint.to_account_info(),
                },
                &[&[
                    b"nft_mint_auth",
                    ctx.accounts.owner.key().as_ref(),
                    &[mint_auth_bump],
                ]],
            ),
            token::spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;
        Ok(())
    }

    #[cfg(feature = "metaplex")]
    pub fn issue_toll_pass_metadata(
        ctx: Context<IssueTollPassMetadata>,
    ) -> Result<()> {
        let pass = &ctx.accounts.toll_pass;
        require_keys_eq!(pass.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require_keys_eq!(ctx.accounts.record.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);

        let name = record_name(&ctx.accounts.record)?;
        let mint_auth_bump = ctx.bumps.nft_mint_authority;

        let metadata_ix = create_metadata_accounts_v3(
            METADATA_PROGRAM_ID,
            ctx.accounts.metadata.key(),
            ctx.accounts.nft_mint.key(),
            ctx.accounts.nft_mint_authority.key(),
            ctx.accounts.owner.key(),
            ctx.accounts.nft_mint_authority.key(),
            format!("{}.dns", name),
            "DDNS".to_string(),
            String::new(),
            None,
            1,
            true,
            true,
            None,
            None,
            None,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &metadata_ix,
            &[
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.nft_mint.to_account_info(),
                ctx.accounts.nft_mint_authority.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.nft_mint_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            &[&[
                b"nft_mint_auth",
                ctx.accounts.owner.key().as_ref(),
                &[mint_auth_bump],
            ]],
        )?;

        let edition_ix = create_master_edition_v3(
            METADATA_PROGRAM_ID,
            ctx.accounts.master_edition.key(),
            ctx.accounts.nft_mint.key(),
            ctx.accounts.nft_mint_authority.key(),
            ctx.accounts.nft_mint_authority.key(),
            ctx.accounts.metadata.key(),
            ctx.accounts.owner.key(),
            Some(0),
        );
        anchor_lang::solana_program::program::invoke_signed(
            &edition_ix,
            &[
                ctx.accounts.master_edition.to_account_info(),
                ctx.accounts.nft_mint.to_account_info(),
                ctx.accounts.nft_mint_authority.to_account_info(),
                ctx.accounts.nft_mint_authority.to_account_info(),
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            &[&[
                b"nft_mint_auth",
                ctx.accounts.owner.key().as_ref(),
                &[mint_auth_bump],
            ]],
        )?;

        Ok(())
    }

    #[cfg(not(feature = "metaplex"))]
    pub fn issue_toll_pass_metadata(
        _ctx: Context<IssueTollPassMetadata>,
    ) -> Result<()> {
        Err(ErrorCode::MetadataDisabled.into())
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

    pub fn create_name_record(
        ctx: Context<CreateNameRecord>,
        name: String,
        page_cid_hash: [u8; 32],
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        validate_name(&name)?;
        let name_hash = hash_name(&name);
        let record = &mut ctx.accounts.record;
        if record.initialized {
            return err!(ErrorCode::AlreadyInitialized);
        }
        require_keys_eq!(ctx.accounts.toll_pass.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        record.owner = ctx.accounts.owner.key();
        record.name_hash = name_hash;
        let mut name_len = 0u8;
        write_name(&name, &mut record.name_bytes, &mut name_len)?;
        record.name_len = name_len;
        record.page_cid_hash = page_cid_hash;
        record.metadata_hash = metadata_hash;
        record.updated_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.record;
        record.initialized = true;
        Ok(())
    }

    pub fn update_name_record(
        ctx: Context<UpdateNameRecord>,
        page_cid_hash: [u8; 32],
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        let record = &mut ctx.accounts.record;
        require_keys_eq!(record.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        record.page_cid_hash = page_cid_hash;
        record.metadata_hash = metadata_hash;
        record.updated_at = Clock::get()?.unix_timestamp;
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
#[instruction(name: String)]
pub struct IssueTollPass<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + TollPass::SIZE,
        seeds = [b"toll_pass", owner.key().as_ref()],
        bump
    )]
    pub toll_pass: Account<'info, TollPass>,

    #[account(
        init,
        payer = owner,
        space = 8 + NameRecord::SIZE,
        seeds = [b"name", name.as_bytes()],
        bump
    )]
    pub record: Account<'info, NameRecord>,

    /// CHECK: Pre-created mint for the NFT
    #[account(mut)]
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: Pre-created token account for the NFT
    #[account(mut)]
    pub nft_token_account: UncheckedAccount<'info>,

    /// CHECK: PDA mint authority
    #[account(seeds = [b"nft_mint_auth", owner.key().as_ref()], bump)]
    pub nft_mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct IssueTollPassMetadata<'info> {
    #[account(
        mut,
        seeds = [b"toll_pass", owner.key().as_ref()],
        bump = toll_pass.bump
    )]
    pub toll_pass: Account<'info, TollPass>,

    #[account(mut)]
    pub record: Account<'info, NameRecord>,

    /// CHECK: Mint for the NFT
    #[account(mut)]
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: Metaplex metadata PDA
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition PDA
    #[account(mut)]
    pub master_edition: UncheckedAccount<'info>,

    /// CHECK: PDA mint authority
    #[account(seeds = [b"nft_mint_auth", owner.key().as_ref()], bump)]
    pub nft_mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
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
#[instruction(name: String)]
pub struct CreateNameRecord<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + NameRecord::SIZE,
        seeds = [b"name", name.as_bytes()],
        bump
    )]
    pub record: Account<'info, NameRecord>,

    #[account(
        seeds = [b"toll_pass", owner.key().as_ref()],
        bump = toll_pass.bump
    )]
    pub toll_pass: Account<'info, TollPass>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateNameRecord<'info> {
    #[account(
        mut,
        seeds = [b"name", record.name_hash.as_ref()],
        bump = record.bump
    )]
    pub record: Account<'info, NameRecord>,

    #[account(mut)]
    pub owner: Signer<'info>,
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
    pub page_cid_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub bump: u8,
    pub initialized: bool,
}

impl TollPass {
    pub const SIZE: usize = 32 + 8 + 32 + 32 + 32 + 1 + 1;
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
    pub owner: Pubkey,
    pub name_hash: [u8; 32],
    pub name_len: u8,
    pub name_bytes: [u8; 32],
    pub page_cid_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub updated_at: i64,
    pub bump: u8,
    pub initialized: bool,
}

impl NameRecord {
    pub const SIZE: usize = 32 + 32 + 1 + 32 + 32 + 32 + 8 + 1 + 1;
}

fn hash_name(name: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    hasher.finalize().into()
}

fn validate_name(name: &str) -> Result<()> {
    let bytes = name.as_bytes();
    if bytes.len() < 4 || bytes.len() > 13 {
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
    let lower = name.to_ascii_lowercase();
    if is_reserved(&lower) {
        return err!(ErrorCode::ReservedName);
    }
    Ok(())
}

fn write_name(name: &str, out: &mut [u8; 32], len_out: &mut u8) -> Result<()> {
    let bytes = name.as_bytes();
    if bytes.len() > 32 {
        return err!(ErrorCode::InvalidNameLength);
    }
    out.fill(0);
    out[..bytes.len()].copy_from_slice(bytes);
    *len_out = bytes.len() as u8;
    Ok(())
}

#[cfg(feature = "metaplex")]
fn record_name(record: &Account<NameRecord>) -> Result<String> {
    let len = record.name_len as usize;
    let name_bytes = &record.name_bytes[..len];
    let name = core::str::from_utf8(name_bytes).map_err(|_| ErrorCode::InvalidNameChars)?;
    Ok(name.to_string())
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
    #[msg("Reserved name")]
    ReservedName,
    #[msg("NFT mint is not owned by token program")]
    InvalidMintOwner,
    #[msg("NFT token account is not owned by token program")]
    InvalidTokenAccountOwner,
    #[msg("Metadata CPI disabled in this build")]
    MetadataDisabled,
}
