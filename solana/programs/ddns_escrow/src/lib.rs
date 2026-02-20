use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use solana_program::sysvar::instructions as sysvar_instructions;
use anchor_spl::token::spl_token;
use solana_program::program_pack::Pack;

declare_id!("EoAdi1RNEYXurdHGUbCnHKGc2DgvKyJqrLVMkXPNj7MR");

const BPS_DENOM: u64 = 10_000;
const MAX_ALLOWLISTED_SIGNERS: usize = 16;
const VOUCHER_DOMAIN_SEP: &[u8] = b"DDNS_VOUCHER_V1";

#[program]
pub mod ddns_escrow {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        authority: Pubkey,
        toll_mint: Pubkey,
        miners_vault: Pubkey,
        treasury_vault: Pubkey,
        domain_bps: u16,
        miners_bps: u16,
        treasury_bps: u16,
        allowlisted_signers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            (domain_bps as u64)
                .saturating_add(miners_bps as u64)
                .saturating_add(treasury_bps as u64)
                == BPS_DENOM,
            EscrowError::InvalidBpsSum
        );
        require!(
            allowlisted_signers.len() <= MAX_ALLOWLISTED_SIGNERS,
            EscrowError::AllowlistTooLarge
        );

        // Basic mint sanity: vaults must be for toll_mint.
        require_keys_eq!(ctx.accounts.toll_mint.key(), toll_mint, EscrowError::InvalidMint);
        let _mint_state = load_spl_mint(&ctx.accounts.toll_mint.to_account_info())?;
        let miners_state = load_spl_token_account(&ctx.accounts.miners_vault.to_account_info())?;
        let treasury_state =
            load_spl_token_account(&ctx.accounts.treasury_vault.to_account_info())?;
        require_keys_eq!(miners_state.mint, toll_mint, EscrowError::InvalidVaultMint);
        require_keys_eq!(treasury_state.mint, toll_mint, EscrowError::InvalidVaultMint);
        require_keys_eq!(
            ctx.accounts.miners_vault.key(),
            miners_vault,
            EscrowError::InvalidVaultAccount
        );
        require_keys_eq!(
            ctx.accounts.treasury_vault.key(),
            treasury_vault,
            EscrowError::InvalidVaultAccount
        );

        let config = &mut ctx.accounts.config;
        config.authority = authority;
        config.toll_mint = toll_mint;
        config.allowlisted_signers = allowlisted_signers;
        config.domain_bps = domain_bps;
        config.miners_bps = miners_bps;
        config.treasury_bps = treasury_bps;
        config.miners_vault = miners_vault;
        config.treasury_vault = treasury_vault;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn init_user_escrow(ctx: Context<InitUserEscrow>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.toll_mint.key(),
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );
        let _mint_state = load_spl_mint(&ctx.accounts.toll_mint.to_account_info())?;

        let vault_state = load_spl_token_account(&ctx.accounts.vault.to_account_info())?;
        require_keys_eq!(
            vault_state.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );
        require_keys_eq!(
            vault_state.owner,
            ctx.accounts.user_escrow.key(),
            EscrowError::InvalidVaultOwner
        );

        let escrow = &mut ctx.accounts.user_escrow;
        escrow.owner = ctx.accounts.user.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.bump = ctx.bumps.user_escrow;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        require_keys_eq!(
            ctx.accounts.user_escrow.owner,
            ctx.accounts.user.key(),
            EscrowError::Unauthorized
        );
        require_keys_eq!(
            ctx.accounts.user_escrow.vault,
            ctx.accounts.vault.key(),
            EscrowError::InvalidVaultAccount
        );
        let user_ata_state = load_spl_token_account(&ctx.accounts.user_ata.to_account_info())?;
        let vault_state = load_spl_token_account(&ctx.accounts.vault.to_account_info())?;
        require_keys_eq!(
            user_ata_state.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );
        require_keys_eq!(
            vault_state.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );

        token::transfer(
            ctx.accounts.transfer_ctx(),
            amount,
        )?;
        Ok(())
    }

    pub fn register_domain_owner(
        ctx: Context<RegisterDomainOwner>,
        name_hash: [u8; 32],
        owner_wallet: Pubkey,
        payout_token_account: Pubkey,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.owner_wallet.key(), owner_wallet, EscrowError::Unauthorized);
        require_keys_eq!(
            ctx.accounts.payout_token_account.key(),
            payout_token_account,
            EscrowError::InvalidPayoutAccount
        );
        require_keys_eq!(
            load_spl_token_account(&ctx.accounts.payout_token_account.to_account_info())?.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );

        let d = &mut ctx.accounts.domain_owner;
        d.name_hash = name_hash;
        d.owner_wallet = owner_wallet;
        d.payout_token_account = payout_token_account;
        d.bump = ctx.bumps.domain_owner;
        Ok(())
    }

    pub fn redeem_toll_voucher(
        ctx: Context<RedeemTollVoucher>,
        voucher_bytes: Vec<u8>,
        signature: [u8; 64],
        nonce: u64,
        redeem_seed: [u8; 32],
    ) -> Result<()> {
        // Deserialize voucher.
        let voucher = VoucherV1::try_from_slice(&voucher_bytes)
            .map_err(|_| error!(EscrowError::InvalidVoucherBytes))?;

        require!(voucher.version == 1, EscrowError::InvalidVoucherVersion);
        require!(voucher.voucher_type == 0, EscrowError::InvalidVoucherType);
        require_keys_eq!(voucher.mint, ctx.accounts.config.toll_mint, EscrowError::InvalidMint);
        require_keys_eq!(
            voucher.payer,
            ctx.accounts.voucher_payer.key(),
            EscrowError::InvalidPayer
        );
        require_keys_eq!(
            ctx.accounts.user_escrow.owner,
            voucher.payer,
            EscrowError::InvalidPayer
        );
        require_keys_eq!(
            ctx.accounts.user_escrow.vault,
            ctx.accounts.payer_vault.key(),
            EscrowError::InvalidVaultAccount
        );
        require!(
            ctx.accounts.domain_owner.name_hash == voucher.name_hash,
            EscrowError::InvalidDomainOwner
        );

        let slot = Clock::get()?.slot;
        require!(slot >= voucher.valid_after_slot, EscrowError::VoucherNotYetValid);
        require!(slot <= voucher.expires_at_slot, EscrowError::VoucherExpired);
        require!(voucher.amount > 0, EscrowError::InvalidAmount);

        let payer_vault_state = load_spl_token_account(&ctx.accounts.payer_vault.to_account_info())?;
        require_keys_eq!(
            payer_vault_state.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );
        require_keys_eq!(
            payer_vault_state.owner,
            ctx.accounts.user_escrow.key(),
            EscrowError::InvalidVaultOwner
        );
        require_keys_eq!(
            load_spl_token_account(&ctx.accounts.domain_owner_ata.to_account_info())?.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );
        require_keys_eq!(
            load_spl_token_account(&ctx.accounts.miners_vault.to_account_info())?.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );
        require_keys_eq!(
            load_spl_token_account(&ctx.accounts.treasury_vault.to_account_info())?.mint,
            ctx.accounts.config.toll_mint,
            EscrowError::InvalidMint
        );

        require!(nonce == voucher.nonce, EscrowError::InvalidNonceSeed);
        require!(
            redeem_seed == expected_redeem_seed(&voucher.payer, nonce),
            EscrowError::InvalidRedeemSeed
        );

        // Verify allowlisted ed25519 signer by inspecting an Ed25519Program instruction in this tx.
        // The ed25519 precompile must have already verified the signature for us.
        let expected_msg = hash_voucher_message(&voucher_bytes);
        let (signer_pubkey, ix_sig) = find_ed25519_verification(
            &ctx.accounts.sysvar_instructions.to_account_info(),
            &expected_msg,
        )?;

        require!(
            ix_sig == signature,
            EscrowError::SignatureMismatch
        );
        require!(
            ctx.accounts.config.is_allowlisted(&signer_pubkey),
            EscrowError::UnauthorizedSigner
        );

        // Create the replay-protection account (already init in accounts struct).
        let redeemed = &mut ctx.accounts.redeemed_voucher;
        redeemed.payer = voucher.payer;
        redeemed.nonce = voucher.nonce;
        redeemed.redeemed_at_slot = slot;
        redeemed.bump = ctx.bumps.redeemed_voucher;

        // Split amounts.
        let amount = voucher.amount;
        let domain_amt = mul_bps(amount, ctx.accounts.config.domain_bps)?;
        let miners_amt = mul_bps(amount, ctx.accounts.config.miners_bps)?;
        let treasury_amt = amount
            .checked_sub(domain_amt)
            .and_then(|v| v.checked_sub(miners_amt))
            .ok_or_else(|| error!(EscrowError::MathOverflow))?;

        // Transfer from payer escrow vault (owned by user_escrow PDA).
        let escrow_seeds: &[&[u8]] = &[
            b"escrow",
            voucher.payer.as_ref(),
            &[ctx.accounts.user_escrow.bump],
        ];

        if domain_amt > 0 {
            token::transfer(
                ctx.accounts.transfer_to_domain_owner_ctx().with_signer(&[escrow_seeds]),
                domain_amt,
            )?;
        }
        if miners_amt > 0 {
            token::transfer(
                ctx.accounts.transfer_to_miners_ctx().with_signer(&[escrow_seeds]),
                miners_amt,
            )?;
        }
        if treasury_amt > 0 {
            token::transfer(
                ctx.accounts.transfer_to_treasury_ctx().with_signer(&[escrow_seeds]),
                treasury_amt,
            )?;
        }

        emit!(TollPaid {
            payer: voucher.payer,
            name_hash: voucher.name_hash,
            amount,
            domain_amt,
            miners_amt,
            treasury_amt,
            nonce: voucher.nonce,
            context_hash: voucher.context_hash,
            signer: signer_pubkey,
            slot,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + EscrowConfig::SIZE,
        seeds = [b"escrow_config"],
        bump
    )]
    pub config: Account<'info, EscrowConfig>,

    /// CHECK: validated in handler (must be SPL mint)
    pub toll_mint: UncheckedAccount<'info>,

    /// CHECK: validated in handler (must be SPL token account for config.toll_mint)
    #[account(mut)]
    pub miners_vault: UncheckedAccount<'info>,
    /// CHECK: validated in handler (must be SPL token account for config.toll_mint)
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitUserEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow_config"],
        bump = config.bump
    )]
    pub config: Account<'info, EscrowConfig>,

    #[account(
        init,
        payer = user,
        space = 8 + UserEscrow::SIZE,
        seeds = [b"escrow", user.key().as_ref()],
        bump
    )]
    pub user_escrow: Account<'info, UserEscrow>,

    /// CHECK: validated in handler (must be SPL token account owned by user_escrow PDA)
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: validated in handler (must equal config.toll_mint)
    pub toll_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"escrow_config"],
        bump = config.bump
    )]
    pub config: Account<'info, EscrowConfig>,

    #[account(
        mut,
        seeds = [b"escrow", user.key().as_ref()],
        bump = user_escrow.bump
    )]
    pub user_escrow: Account<'info, UserEscrow>,

    /// CHECK: validated in handler (must be user's SPL token account for config.toll_mint)
    #[account(mut)]
    pub user_ata: UncheckedAccount<'info>,

    /// CHECK: validated in handler (must be payer's escrow SPL token account for config.toll_mint)
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Deposit<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.user_ata.to_account_info(),
                to: self.vault.to_account_info(),
                authority: self.user.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(name_hash: [u8; 32])]
pub struct RegisterDomainOwner<'info> {
    #[account(
        seeds = [b"escrow_config"],
        bump = config.bump
    )]
    pub config: Account<'info, EscrowConfig>,

    #[account(
        init,
        payer = owner_wallet,
        space = 8 + DomainOwner::SIZE,
        seeds = [b"domain_owner", name_hash.as_ref()],
        bump
    )]
    pub domain_owner: Account<'info, DomainOwner>,

    /// CHECK: validated in handler (must be SPL token account for config.toll_mint)
    #[account(mut)]
    pub payout_token_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
// Anchor deserializes instruction args for account constraints in the exact order listed here.
// This MUST match the instruction's arg order (or a prefix). Since `nonce`/`redeem_seed` are
// not the first args of `redeem_toll_voucher`, we include the preceding args to avoid decoding
// `voucher_bytes` as `nonce` (which would break PDA seed constraints).
#[instruction(voucher_bytes: Vec<u8>, signature: [u8; 64], nonce: u64, redeem_seed: [u8; 32])]
pub struct RedeemTollVoucher<'info> {
    #[account(
        seeds = [b"escrow_config"],
        bump = config.bump
    )]
    pub config: Account<'info, EscrowConfig>,

    /// CHECK: payer does not need to sign; voucher allows spending from pre-funded escrow vault.
    pub voucher_payer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", voucher_payer.key().as_ref()],
        bump = user_escrow.bump
    )]
    pub user_escrow: Account<'info, UserEscrow>,

    /// CHECK: validated in handler (must match user_escrow.vault and be SPL token account for config.toll_mint)
    #[account(mut)]
    pub payer_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"domain_owner", domain_owner.name_hash.as_ref()],
        bump = domain_owner.bump
    )]
    pub domain_owner: Account<'info, DomainOwner>,

    /// CHECK: validated in handler (must equal domain_owner.payout_token_account and be SPL token account for config.toll_mint)
    #[account(mut, address = domain_owner.payout_token_account)]
    pub domain_owner_ata: UncheckedAccount<'info>,

    /// CHECK: validated in handler (must equal config.miners_vault and be SPL token account for config.toll_mint)
    #[account(mut, address = config.miners_vault)]
    pub miners_vault: UncheckedAccount<'info>,

    /// CHECK: validated in handler (must equal config.treasury_vault and be SPL token account for config.toll_mint)
    #[account(mut, address = config.treasury_vault)]
    pub treasury_vault: UncheckedAccount<'info>,

    #[account(
        init,
        payer = fee_payer,
        space = 8 + RedeemedVoucher::SIZE,
        seeds = [b"redeemed", voucher_payer.key().as_ref(), redeem_seed.as_ref()],
        bump
    )]
    pub redeemed_voucher: Account<'info, RedeemedVoucher>,

    #[account(mut)]
    pub fee_payer: Signer<'info>,

    /// CHECK: must be the instructions sysvar.
    #[account(address = sysvar_instructions::ID)]
    pub sysvar_instructions: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> RedeemTollVoucher<'info> {
    fn transfer_to_domain_owner_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.payer_vault.to_account_info(),
                to: self.domain_owner_ata.to_account_info(),
                authority: self.user_escrow.to_account_info(),
            },
        )
    }

    fn transfer_to_miners_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.payer_vault.to_account_info(),
                to: self.miners_vault.to_account_info(),
                authority: self.user_escrow.to_account_info(),
            },
        )
    }

    fn transfer_to_treasury_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.payer_vault.to_account_info(),
                to: self.treasury_vault.to_account_info(),
                authority: self.user_escrow.to_account_info(),
            },
        )
    }
}

#[account]
pub struct EscrowConfig {
    pub authority: Pubkey,
    pub toll_mint: Pubkey,
    pub allowlisted_signers: Vec<Pubkey>,
    pub domain_bps: u16,
    pub miners_bps: u16,
    pub treasury_bps: u16,
    pub miners_vault: Pubkey,
    pub treasury_vault: Pubkey,
    pub bump: u8,
}

impl EscrowConfig {
    pub const SIZE: usize = 32  // authority
        + 32 // toll_mint
        + 4 + (MAX_ALLOWLISTED_SIGNERS * 32) // allowlisted_signers vec
        + 2 + 2 + 2 // bps
        + 32 + 32 // vault pubkeys
        + 1; // bump

    pub fn is_allowlisted(&self, pk: &Pubkey) -> bool {
        self.allowlisted_signers.iter().any(|p| p == pk)
    }
}

#[account]
pub struct UserEscrow {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
}

impl UserEscrow {
    pub const SIZE: usize = 32 + 32 + 1;
}

#[account]
pub struct DomainOwner {
    pub name_hash: [u8; 32],
    pub owner_wallet: Pubkey,
    pub payout_token_account: Pubkey,
    pub bump: u8,
}

impl DomainOwner {
    pub const SIZE: usize = 32 + 32 + 32 + 1;
}

#[account]
pub struct RedeemedVoucher {
    pub payer: Pubkey,
    pub nonce: u64,
    pub redeemed_at_slot: u64,
    pub bump: u8,
}

impl RedeemedVoucher {
    pub const SIZE: usize = 32 + 8 + 8 + 1;
}

#[event]
pub struct TollPaid {
    pub payer: Pubkey,
    pub name_hash: [u8; 32],
    pub amount: u64,
    pub domain_amt: u64,
    pub miners_amt: u64,
    pub treasury_amt: u64,
    pub nonce: u64,
    pub context_hash: [u8; 32],
    pub signer: Pubkey,
    pub slot: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct VoucherV1 {
    pub version: u8,
    pub voucher_type: u8, // 0 = toll
    pub payer: Pubkey,
    pub name_hash: [u8; 32],
    pub amount: u64,
    pub mint: Pubkey,
    pub nonce: u64,
    pub valid_after_slot: u64,
    pub expires_at_slot: u64,
    pub context_hash: [u8; 32],
}

fn hash_voucher_message(voucher_bytes: &[u8]) -> [u8; 32] {
    let h = solana_program::hash::hashv(&[VOUCHER_DOMAIN_SEP, voucher_bytes]);
    h.to_bytes()
}

fn expected_redeem_seed(payer: &Pubkey, nonce: u64) -> [u8; 32] {
    let nonce_bytes = nonce.to_le_bytes();
    solana_program::hash::hashv(&[payer.as_ref(), &nonce_bytes]).to_bytes()
}

fn mul_bps(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or_else(|| error!(EscrowError::MathOverflow))?
        / (BPS_DENOM as u128);
    Ok(v as u64)
}

fn find_ed25519_verification(
    sysvar_ix: &AccountInfo,
    expected_message: &[u8; 32],
) -> Result<(Pubkey, [u8; 64])> {
    let current_idx = sysvar_instructions::load_current_index_checked(sysvar_ix)
        .map_err(|_| error!(EscrowError::MissingEd25519Ix))? as usize;

    // Scan all prior instructions for an Ed25519 verification over `expected_message`.
    for i in 0..current_idx {
        let ix = sysvar_instructions::load_instruction_at_checked(i, sysvar_ix)
            .map_err(|_| error!(EscrowError::MissingEd25519Ix))?;

        if ix.program_id != solana_program::ed25519_program::id() {
            continue;
        }

        let (pk, sig, msg) = parse_ed25519_ix(&ix.data)?;
        if msg.as_slice() == expected_message {
            return Ok((pk, sig));
        }
    }

    err!(EscrowError::MissingEd25519Ix)
}

fn parse_ed25519_ix(data: &[u8]) -> Result<(Pubkey, [u8; 64], Vec<u8>)> {
    // Based on the Solana ed25519 instruction layout. We only support the common case:
    // - num_signatures = 1
    // - offsets refer to data in the same instruction (instruction_index = u16::MAX)
    if data.len() < 2 {
        return err!(EscrowError::InvalidEd25519Ix);
    }
    let num = data[0] as usize;
    require!(num >= 1, EscrowError::InvalidEd25519Ix);

    // Offsets struct starts at byte 2 and is 14 bytes for the first signature.
    let off_start = 2;
    let off_end = off_start + 14;
    require!(data.len() >= off_end, EscrowError::InvalidEd25519Ix);

    let read_u16 = |idx: usize| -> u16 {
        u16::from_le_bytes([data[idx], data[idx + 1]])
    };

    let signature_offset = read_u16(off_start + 0) as usize;
    let signature_ix_idx = read_u16(off_start + 2);
    let pubkey_offset = read_u16(off_start + 4) as usize;
    let pubkey_ix_idx = read_u16(off_start + 6);
    let msg_offset = read_u16(off_start + 8) as usize;
    let msg_size = read_u16(off_start + 10) as usize;
    let msg_ix_idx = read_u16(off_start + 12);

    // Only support "inline" data.
    require!(
        signature_ix_idx == u16::MAX && pubkey_ix_idx == u16::MAX && msg_ix_idx == u16::MAX,
        EscrowError::InvalidEd25519Ix
    );

    require!(
        data.len() >= pubkey_offset + 32,
        EscrowError::InvalidEd25519Ix
    );
    require!(
        data.len() >= signature_offset + 64,
        EscrowError::InvalidEd25519Ix
    );
    require!(
        data.len() >= msg_offset + msg_size,
        EscrowError::InvalidEd25519Ix
    );

    let pk = Pubkey::new_from_array(data[pubkey_offset..pubkey_offset + 32].try_into().unwrap());
    let sig: [u8; 64] = data[signature_offset..signature_offset + 64]
        .try_into()
        .map_err(|_| error!(EscrowError::InvalidEd25519Ix))?;
    let msg = data[msg_offset..msg_offset + msg_size].to_vec();

    Ok((pk, sig, msg))
}

fn load_spl_token_account(ai: &AccountInfo) -> Result<spl_token::state::Account> {
    require_keys_eq!(*ai.owner, anchor_spl::token::ID, EscrowError::InvalidTokenProgramOwner);
    let data = ai
        .try_borrow_data()
        .map_err(|_| error!(EscrowError::InvalidTokenAccountData))?;
    spl_token::state::Account::unpack(&data).map_err(|_| error!(EscrowError::InvalidTokenAccountData))
}

fn load_spl_mint(ai: &AccountInfo) -> Result<spl_token::state::Mint> {
    require_keys_eq!(*ai.owner, anchor_spl::token::ID, EscrowError::InvalidTokenProgramOwner);
    let data = ai
        .try_borrow_data()
        .map_err(|_| error!(EscrowError::InvalidMintAccountData))?;
    spl_token::state::Mint::unpack(&data).map_err(|_| error!(EscrowError::InvalidMintAccountData))
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid BPS sum; must equal 10_000")]
    InvalidBpsSum,
    #[msg("Allowlist too large")]
    AllowlistTooLarge,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid vault mint")]
    InvalidVaultMint,
    #[msg("Invalid vault account")]
    InvalidVaultAccount,
    #[msg("Invalid vault owner; vault token account must be owned by the user escrow PDA")]
    InvalidVaultOwner,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid payout token account")]
    InvalidPayoutAccount,
    #[msg("Account is not owned by the SPL Token program")]
    InvalidTokenProgramOwner,
    #[msg("Invalid SPL token account data")]
    InvalidTokenAccountData,
    #[msg("Invalid SPL mint account data")]
    InvalidMintAccountData,
    #[msg("Invalid voucher bytes")]
    InvalidVoucherBytes,
    #[msg("Invalid voucher version")]
    InvalidVoucherVersion,
    #[msg("Invalid voucher type")]
    InvalidVoucherType,
    #[msg("Invalid payer")]
    InvalidPayer,
    #[msg("Invalid domain owner for name_hash")]
    InvalidDomainOwner,
    #[msg("Voucher not yet valid")]
    VoucherNotYetValid,
    #[msg("Voucher expired")]
    VoucherExpired,
    #[msg("Missing ed25519 verification instruction")]
    MissingEd25519Ix,
    #[msg("Invalid ed25519 verification instruction")]
    InvalidEd25519Ix,
    #[msg("Signer not allowlisted")]
    UnauthorizedSigner,
    #[msg("Signature mismatch")]
    SignatureMismatch,
    #[msg("nonce_le_bytes does not match voucher.nonce")]
    InvalidNonceSeed,
    #[msg("redeem_seed does not match sha256(payer || nonce_le)")]
    InvalidRedeemSeed,
    #[msg("Math overflow")]
    MathOverflow,
}
