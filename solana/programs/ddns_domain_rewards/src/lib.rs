use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::{self, Token, Transfer};
use spl_token::state::Account as SplTokenAccount;

declare_id!("BTsZBPqu92LWeqtPHDoMDuDAhd3mHmiers3pwrH2r2Pe");

#[program]
pub mod ddns_domain_rewards {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        default_owner_bps: u16,
        default_miners_bps: u16,
        default_treasury_bps: u16,
        min_toll_amount: u64,
        enabled: bool,
    ) -> Result<()> {
        require_splits_ok(default_owner_bps, default_miners_bps, default_treasury_bps)?;
        require!(min_toll_amount > 0, DomainRewardsError::BadAmount);

        // Create vault_authority PDA as 0-data system account so it can sign SPL token transfers.
        require!(
            ctx.accounts.vault_authority.data_is_empty() && ctx.accounts.vault_authority.lamports() == 0,
            DomainRewardsError::VaultAuthorityAlreadyExists
        );
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(0);
        let auth_seeds: &[&[u8]] = &[b"vault_authority", &[ctx.bumps.vault_authority]];
        let signer_seeds: &[&[&[u8]]] = &[auth_seeds];
        let create_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.vault_authority.key(),
            lamports,
            0,
            &anchor_lang::solana_program::system_program::ID,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Create + initialize treasury vault SPL token account.
        require!(
            ctx.accounts.treasury_vault.data_is_empty() && ctx.accounts.treasury_vault.lamports() == 0,
            DomainRewardsError::VaultAlreadyExists
        );
        require!(
            *ctx.accounts.toll_mint.owner == ctx.accounts.token_program.key(),
            DomainRewardsError::BadMintOwner
        );
        let rent = Rent::get()?;
        let vault_lamports = rent.minimum_balance(SplTokenAccount::LEN);
        let create_treasury_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.treasury_vault.key(),
            vault_lamports,
            SplTokenAccount::LEN as u64,
            &ctx.accounts.token_program.key(),
        );
        anchor_lang::solana_program::program::invoke(
            &create_treasury_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.treasury_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        let init_treasury_ix = spl_token::instruction::initialize_account3(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.treasury_vault.key(),
            &ctx.accounts.toll_mint.key(),
            &ctx.accounts.vault_authority.key(),
        )?;
        anchor_lang::solana_program::program::invoke(
            &init_treasury_ix,
            &[
                ctx.accounts.treasury_vault.to_account_info(),
                ctx.accounts.toll_mint.to_account_info(),
            ],
        )?;

        // Create + initialize miners vault SPL token account.
        require!(
            ctx.accounts.miners_vault.data_is_empty() && ctx.accounts.miners_vault.lamports() == 0,
            DomainRewardsError::VaultAlreadyExists
        );
        let create_miners_ix = anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.miners_vault.key(),
            vault_lamports,
            SplTokenAccount::LEN as u64,
            &ctx.accounts.token_program.key(),
        );
        anchor_lang::solana_program::program::invoke(
            &create_miners_ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.miners_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        let init_miners_ix = spl_token::instruction::initialize_account3(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.miners_vault.key(),
            &ctx.accounts.toll_mint.key(),
            &ctx.accounts.vault_authority.key(),
        )?;
        anchor_lang::solana_program::program::invoke(
            &init_miners_ix,
            &[
                ctx.accounts.miners_vault.to_account_info(),
                ctx.accounts.toll_mint.to_account_info(),
            ],
        )?;

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.toll_mint = ctx.accounts.toll_mint.key();
        cfg.vault_authority_bump = ctx.bumps.vault_authority;
        cfg.treasury_vault = ctx.accounts.treasury_vault.key();
        cfg.miners_vault = ctx.accounts.miners_vault.key();
        cfg.default_owner_bps = default_owner_bps;
        cfg.default_miners_bps = default_miners_bps;
        cfg.default_treasury_bps = default_treasury_bps;
        cfg.min_toll_amount = min_toll_amount;
        cfg.enabled = enabled;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn register_domain_owner(
        ctx: Context<RegisterDomainOwner>,
        name_hash: [u8; 32],
        owner_bps: u16,
        miners_bps: u16,
        treasury_bps: u16,
    ) -> Result<()> {
        require_splits_ok(owner_bps, miners_bps, treasury_bps)?;
        let now = Clock::get()?.slot;

        let o = &mut ctx.accounts.domain_owner;
        o.name_hash = name_hash;
        o.owner_wallet = ctx.accounts.owner_wallet.key();
        o.owner_bps = owner_bps;
        o.miners_bps = miners_bps;
        o.treasury_bps = treasury_bps;
        o.updated_at_slot = now;
        o.bump = ctx.bumps.domain_owner;
        Ok(())
    }

    pub fn update_domain_splits(
        ctx: Context<UpdateDomainSplits>,
        owner_bps: u16,
        miners_bps: u16,
        treasury_bps: u16,
    ) -> Result<()> {
        require_splits_ok(owner_bps, miners_bps, treasury_bps)?;
        let now = Clock::get()?.slot;
        let o = &mut ctx.accounts.domain_owner;
        o.owner_bps = owner_bps;
        o.miners_bps = miners_bps;
        o.treasury_bps = treasury_bps;
        o.updated_at_slot = now;
        Ok(())
    }

    // MVP toll event payment: payer pays `amount` in TOLL and the program splits it immediately:
    // - owner share to domain owner's payout ATA (if DomainOwner exists and owner_bps>0)
    // - miners share to miners_vault PDA token account
    // - treasury share to treasury_vault PDA token account
    //
    // If DomainOwner account is absent/invalid, defaults are used with owner share = 0 by default.
    pub fn toll_pay_for_route(
        ctx: Context<TollPayForRoute>,
        name_hash: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, DomainRewardsError::BadAmount);
        let cfg = &ctx.accounts.config;
        require!(cfg.enabled, DomainRewardsError::Disabled);
        require!(amount >= cfg.min_toll_amount, DomainRewardsError::BelowMinToll);

        // Validate payer ATA.
        let payer_ata = read_spl_token_account(
            &ctx.accounts.payer_toll_ata.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(payer_ata.mint == cfg.toll_mint, DomainRewardsError::BadMint);
        require!(payer_ata.owner == ctx.accounts.payer.key(), DomainRewardsError::BadPayerAtaOwner);

        // Validate vault accounts.
        require!(
            ctx.accounts.treasury_vault.key() == cfg.treasury_vault,
            DomainRewardsError::BadTreasuryVault
        );
        require!(
            ctx.accounts.miners_vault.key() == cfg.miners_vault,
            DomainRewardsError::BadMinersVault
        );

        let treasury_ata = read_spl_token_account(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        let miners_ata = read_spl_token_account(
            &ctx.accounts.miners_vault.to_account_info(),
            &ctx.accounts.token_program.key(),
        )?;
        require!(treasury_ata.mint == cfg.toll_mint, DomainRewardsError::BadMint);
        require!(miners_ata.mint == cfg.toll_mint, DomainRewardsError::BadMint);
        require!(
            treasury_ata.owner == ctx.accounts.vault_authority.key(),
            DomainRewardsError::BadVaultOwner
        );
        require!(
            miners_ata.owner == ctx.accounts.vault_authority.key(),
            DomainRewardsError::BadVaultOwner
        );

        let mut owner_bps = cfg.default_owner_bps;
        let mut miners_bps = cfg.default_miners_bps;
        let mut treasury_bps = cfg.default_treasury_bps;
        let mut owner_wallet = Pubkey::default();

        // Optional DomainOwner account:
        // - if it's owned by this program and deserializes, we use its splits and owner_wallet
        // - otherwise, we use defaults.
        if ctx.accounts.domain_owner.owner == ctx.program_id && !ctx.accounts.domain_owner.data_is_empty() {
            if let Ok(o) = DomainOwner::try_deserialize(&mut &ctx.accounts.domain_owner.data.borrow()[..]) {
                if o.name_hash == name_hash {
                    owner_bps = o.owner_bps;
                    miners_bps = o.miners_bps;
                    treasury_bps = o.treasury_bps;
                    owner_wallet = o.owner_wallet;
                }
            }
        }
        require_splits_ok(owner_bps, miners_bps, treasury_bps)?;

        let owner_amount = bps_amount(amount, owner_bps)?;
        let miners_amount = bps_amount(amount, miners_bps)?;
        let treasury_amount = amount
            .checked_sub(owner_amount)
            .ok_or(DomainRewardsError::Overflow)?
            .checked_sub(miners_amount)
            .ok_or(DomainRewardsError::Overflow)?;

        // Owner share (if any).
        if owner_amount > 0 {
            // Validate owner ATA belongs to owner_wallet and is for the correct mint.
            let owner_ata = read_spl_token_account(
                &ctx.accounts.owner_payout_ata.to_account_info(),
                &ctx.accounts.token_program.key(),
            )?;
            require!(owner_ata.mint == cfg.toll_mint, DomainRewardsError::BadMint);
            require!(owner_wallet != Pubkey::default(), DomainRewardsError::MissingOwner);
            require!(owner_ata.owner == owner_wallet, DomainRewardsError::BadOwnerAtaOwner);

            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_toll_ata.to_account_info(),
                    to: ctx.accounts.owner_payout_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            );
            token::transfer(cpi_ctx, owner_amount)?;
        }

        // Miners vault.
        if miners_amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_toll_ata.to_account_info(),
                    to: ctx.accounts.miners_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            );
            token::transfer(cpi_ctx, miners_amount)?;
        }

        // Treasury vault.
        if treasury_amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_toll_ata.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            );
            token::transfer(cpi_ctx, treasury_amount)?;
        }

        Ok(())
    }
}

fn require_splits_ok(owner_bps: u16, miners_bps: u16, treasury_bps: u16) -> Result<()> {
    require!(owner_bps <= 10_000, DomainRewardsError::BadBps);
    require!(miners_bps <= 10_000, DomainRewardsError::BadBps);
    require!(treasury_bps <= 10_000, DomainRewardsError::BadBps);
    let sum = (owner_bps as u32)
        .checked_add(miners_bps as u32)
        .ok_or(DomainRewardsError::Overflow)?
        .checked_add(treasury_bps as u32)
        .ok_or(DomainRewardsError::Overflow)?;
    require!(sum == 10_000, DomainRewardsError::BadBps);
    Ok(())
}

fn bps_amount(amount: u64, bps: u16) -> Result<u64> {
    Ok(((amount as u128)
        .checked_mul(bps as u128)
        .ok_or(DomainRewardsError::Overflow)?
        / 10_000u128) as u64)
}

fn read_spl_token_account(ai: &AccountInfo, token_program: &Pubkey) -> Result<SplTokenAccount> {
    require!(*ai.owner == *token_program, DomainRewardsError::BadTokenAccountOwner);
    let data = ai.try_borrow_data()?;
    SplTokenAccount::unpack(&data).map_err(|_| error!(DomainRewardsError::BadTokenAccountData))
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::SIZE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: validated in-program (must be owned by SPL Token program)
    pub toll_mint: UncheckedAccount<'info>,

    /// CHECK: PDA created as 0-data system account so it can sign SPL token transfers.
    #[account(mut, seeds = [b"vault_authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub treasury_vault: Signer<'info>,

    #[account(mut)]
    pub miners_vault: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8;32])]
pub struct RegisterDomainOwner<'info> {
    #[account(mut)]
    pub owner_wallet: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = owner_wallet,
        space = 8 + DomainOwner::SIZE,
        seeds = [b"domain_owner", name_hash.as_ref()],
        bump
    )]
    pub domain_owner: Account<'info, DomainOwner>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDomainSplits<'info> {
    pub owner_wallet: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"domain_owner", domain_owner.name_hash.as_ref()],
        bump = domain_owner.bump,
        constraint = domain_owner.owner_wallet == owner_wallet.key() @ DomainRewardsError::Unauthorized
    )]
    pub domain_owner: Account<'info, DomainOwner>,
}

#[derive(Accounts)]
#[instruction(name_hash: [u8;32])]
pub struct TollPayForRoute<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    pub payer: Signer<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub payer_toll_ata: UncheckedAccount<'info>,

    /// CHECK: optional account; if present must be DomainOwner PDA for name_hash
    #[account(mut)]
    pub domain_owner: UncheckedAccount<'info>,

    /// CHECK: only used if owner_bps > 0; validated in-program
    #[account(mut)]
    pub owner_payout_ata: UncheckedAccount<'info>,

    /// CHECK: PDA that owns vault token accounts
    #[account(seeds = [b"vault_authority"], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    /// CHECK: validated in-program (SPL token account; mint + owner)
    #[account(mut)]
    pub miners_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub toll_mint: Pubkey,
    pub vault_authority_bump: u8,
    pub treasury_vault: Pubkey,
    pub miners_vault: Pubkey,
    pub default_owner_bps: u16,
    pub default_miners_bps: u16,
    pub default_treasury_bps: u16,
    pub min_toll_amount: u64,
    pub enabled: bool,
    pub bump: u8,
}

impl Config {
    pub const SIZE: usize = 32 + 32 + 1 + 32 + 32 + 2 + 2 + 2 + 8 + 1 + 1;
}

#[account]
pub struct DomainOwner {
    pub name_hash: [u8; 32],
    pub owner_wallet: Pubkey,
    pub owner_bps: u16,
    pub miners_bps: u16,
    pub treasury_bps: u16,
    pub updated_at_slot: u64,
    pub bump: u8,
}

impl DomainOwner {
    pub const SIZE: usize = 32 + 32 + 2 + 2 + 2 + 8 + 1;
}

#[error_code]
pub enum DomainRewardsError {
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Program disabled.")]
    Disabled,
    #[msg("Bad amount.")]
    BadAmount,
    #[msg("Below minimum toll amount.")]
    BelowMinToll,
    #[msg("Bad basis points.")]
    BadBps,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Bad mint.")]
    BadMint,
    #[msg("Mint account is not owned by SPL Token program.")]
    BadMintOwner,
    #[msg("Bad token account owner.")]
    BadTokenAccountOwner,
    #[msg("Bad token account data.")]
    BadTokenAccountData,
    #[msg("Payer ATA owner mismatch.")]
    BadPayerAtaOwner,
    #[msg("Treasury vault mismatch.")]
    BadTreasuryVault,
    #[msg("Miners vault mismatch.")]
    BadMinersVault,
    #[msg("Vault token-account owner mismatch.")]
    BadVaultOwner,
    #[msg("Missing domain owner wallet.")]
    MissingOwner,
    #[msg("Owner payout ATA owner mismatch.")]
    BadOwnerAtaOwner,
    #[msg("Vault authority already exists.")]
    VaultAuthorityAlreadyExists,
    #[msg("Vault already exists.")]
    VaultAlreadyExists,
}
