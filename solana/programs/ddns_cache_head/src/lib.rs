use anchor_lang::prelude::*;

declare_id!("943epY8PMFRQkzJGaqjS8wLexHnQxS2o1cNm4xU1UDGb");

const SEED_CACHE_HEAD: &[u8] = b"cache_head";

#[program]
pub mod ddns_cache_head {
    use super::*;

    pub fn init_cache_head(
        ctx: Context<InitCacheHead>,
        parent_name_hash: [u8; 32],
        parent_owner: Pubkey,
    ) -> Result<()> {
        let head = &mut ctx.accounts.cache_head;
        head.parent_name_hash = parent_name_hash;
        head.parent_owner = parent_owner;
        head.cache_root = [0u8; 32];
        head.cid_hash = [0u8; 32];
        head.updated_at_slot = Clock::get()?.slot;
        head.epoch_id = 0;
        head.enabled = true;
        head.bump = ctx.bumps.cache_head;
        Ok(())
    }

    pub fn set_cache_head(
        ctx: Context<SetCacheHead>,
        parent_name_hash: [u8; 32],
        cache_root: [u8; 32],
        cid_hash: [u8; 32],
        epoch_id: u64,
    ) -> Result<()> {
        let head = &mut ctx.accounts.cache_head;
        require!(head.enabled, CacheHeadError::Disabled);
        require!(head.parent_name_hash == parent_name_hash, CacheHeadError::ParentMismatch);
        require_keys_eq!(head.parent_owner, ctx.accounts.parent_owner.key(), CacheHeadError::Unauthorized);

        head.cache_root = cache_root;
        head.cid_hash = cid_hash;
        head.updated_at_slot = Clock::get()?.slot;
        head.epoch_id = epoch_id;
        Ok(())
    }

    pub fn set_cache_head_enabled(
        ctx: Context<SetCacheHeadEnabled>,
        parent_name_hash: [u8; 32],
        enabled: bool,
    ) -> Result<()> {
        let head = &mut ctx.accounts.cache_head;
        require!(head.parent_name_hash == parent_name_hash, CacheHeadError::ParentMismatch);
        require_keys_eq!(head.parent_owner, ctx.accounts.parent_owner.key(), CacheHeadError::Unauthorized);
        head.enabled = enabled;
        head.updated_at_slot = Clock::get()?.slot;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(parent_name_hash: [u8; 32])]
pub struct InitCacheHead<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + DomainCacheHead::SIZE,
        seeds = [SEED_CACHE_HEAD, parent_name_hash.as_ref()],
        bump
    )]
    pub cache_head: Account<'info, DomainCacheHead>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(parent_name_hash: [u8; 32])]
pub struct SetCacheHead<'info> {
    #[account(
        mut,
        seeds = [SEED_CACHE_HEAD, parent_name_hash.as_ref()],
        bump = cache_head.bump
    )]
    pub cache_head: Account<'info, DomainCacheHead>,

    pub parent_owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(parent_name_hash: [u8; 32])]
pub struct SetCacheHeadEnabled<'info> {
    #[account(
        mut,
        seeds = [SEED_CACHE_HEAD, parent_name_hash.as_ref()],
        bump = cache_head.bump
    )]
    pub cache_head: Account<'info, DomainCacheHead>,

    pub parent_owner: Signer<'info>,
}

#[account]
pub struct DomainCacheHead {
    pub parent_name_hash: [u8; 32],
    pub parent_owner: Pubkey,
    pub cache_root: [u8; 32],
    pub cid_hash: [u8; 32],
    pub updated_at_slot: u64,
    pub epoch_id: u64,
    pub enabled: bool,
    pub bump: u8,
}

impl DomainCacheHead {
    pub const SIZE: usize = 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[error_code]
pub enum CacheHeadError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Cache head disabled")]
    Disabled,
    #[msg("Parent hash mismatch")]
    ParentMismatch,
}
