use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

declare_id!("9RNRmBdFfdo6GNRzgutbNcV3bJSJXzhoCtqGQ8HBpfTi");

const SEED_CONFIG: &[u8] = b"rent_bond_config";
const SEED_RESERVE: &[u8] = b"program_reserve";
const MIN_RESERVE_LAMPORTS: u64 = 5_000_000_000;
const BUFFER_LAMPORTS: u64 = 1_000_000_000;

#[program]
pub mod ddns_rent_bond {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn init_config(
        ctx: Context<InitConfig>,
        reserve_target_lamports: u64,
        tracked_programs_hash: [u8; 32],
        tracked_programs_count: u16,
        validator_vote_allowlist_hash: [u8; 32],
        validator_vote_allowlist_count: u16,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.tracked_programs_hash = tracked_programs_hash;
        cfg.tracked_programs_count = tracked_programs_count;
        cfg.validator_vote_allowlist_hash = validator_vote_allowlist_hash;
        cfg.validator_vote_allowlist_count = validator_vote_allowlist_count;
        cfg.reserve_target_lamports = reserve_target_lamports.max(MIN_RESERVE_LAMPORTS);
        cfg.bump = ctx.bumps.config;

        let reserve_lamports = ctx.accounts.reserve.to_account_info().lamports();
        let reserve = &mut ctx.accounts.reserve;
        reserve.lamports_balance = reserve_lamports;
        reserve.last_recalc_slot = Clock::get()?.slot;
        reserve.bump = ctx.bumps.reserve;
        Ok(())
    }

    pub fn set_tracked_programs(
        ctx: Context<SetTrackedPrograms>,
        tracked_programs_hash: [u8; 32],
        tracked_programs_count: u16,
        validator_vote_allowlist_hash: [u8; 32],
        validator_vote_allowlist_count: u16,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(
            cfg.authority,
            ctx.accounts.authority.key(),
            RentBondError::Unauthorized
        );
        cfg.tracked_programs_hash = tracked_programs_hash;
        cfg.tracked_programs_count = tracked_programs_count;
        cfg.validator_vote_allowlist_hash = validator_vote_allowlist_hash;
        cfg.validator_vote_allowlist_count = validator_vote_allowlist_count;
        Ok(())
    }

    pub fn recalc_targets(
        ctx: Context<RecalcTargets>,
        largest_program_lamports: u64,
        optional_extra_lamports: u64,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(
            cfg.authority,
            ctx.accounts.authority.key(),
            RentBondError::Unauthorized
        );
        let target = compute_reserve_target(largest_program_lamports, optional_extra_lamports)?;
        cfg.reserve_target_lamports = target;

        let reserve_lamports = ctx.accounts.reserve.to_account_info().lamports();
        let reserve = &mut ctx.accounts.reserve;
        reserve.lamports_balance = reserve_lamports;
        reserve.last_recalc_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn deposit_reserve(ctx: Context<DepositReserve>, lamports: u64) -> Result<()> {
        require!(lamports > 0, RentBondError::InvalidAmount);
        let cfg = &ctx.accounts.config;
        require_keys_eq!(
            cfg.authority,
            ctx.accounts.authority.key(),
            RentBondError::Unauthorized
        );

        let ix = system_instruction::transfer(
            &ctx.accounts.authority.key(),
            &ctx.accounts.reserve.key(),
            lamports,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.reserve.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let reserve_lamports = ctx.accounts.reserve.to_account_info().lamports();
        let reserve = &mut ctx.accounts.reserve;
        reserve.lamports_balance = reserve_lamports;
        reserve.last_recalc_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn withdraw_reserve(ctx: Context<WithdrawReserve>, lamports: u64) -> Result<()> {
        require!(lamports > 0, RentBondError::InvalidAmount);
        let cfg = &ctx.accounts.config;
        require_keys_eq!(
            cfg.authority,
            ctx.accounts.authority.key(),
            RentBondError::Unauthorized
        );

        let reserve_info = ctx.accounts.reserve.to_account_info();
        let current = reserve_info.lamports();
        let rent = Rent::get()?;
        let min_lamports = rent.minimum_balance(8 + ProgramReserve::SIZE);
        require!(
            current.saturating_sub(lamports) >= min_lamports,
            RentBondError::ReserveRentViolation
        );

        **reserve_info.try_borrow_mut_lamports()? -= lamports;
        **ctx.accounts.recipient.try_borrow_mut_lamports()? += lamports;

        let reserve = &mut ctx.accounts.reserve;
        reserve.lamports_balance = reserve_info.lamports();
        reserve.last_recalc_slot = Clock::get()?.slot;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RentBondConfig::SIZE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Account<'info, RentBondConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + ProgramReserve::SIZE,
        seeds = [SEED_RESERVE],
        bump
    )]
    pub reserve: Account<'info, ProgramReserve>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetTrackedPrograms<'info> {
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, RentBondConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecalcTargets<'info> {
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, RentBondConfig>,
    #[account(mut, seeds = [SEED_RESERVE], bump = reserve.bump)]
    pub reserve: Account<'info, ProgramReserve>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositReserve<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, RentBondConfig>,
    #[account(mut, seeds = [SEED_RESERVE], bump = reserve.bump)]
    pub reserve: Account<'info, ProgramReserve>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawReserve<'info> {
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Account<'info, RentBondConfig>,
    #[account(mut, seeds = [SEED_RESERVE], bump = reserve.bump)]
    pub reserve: Account<'info, ProgramReserve>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: recipient can be any system account.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

#[account]
pub struct RentBondConfig {
    pub authority: Pubkey,
    pub tracked_programs_hash: [u8; 32],
    pub tracked_programs_count: u16,
    pub validator_vote_allowlist_hash: [u8; 32],
    pub validator_vote_allowlist_count: u16,
    pub reserve_target_lamports: u64,
    pub bump: u8,
}

impl RentBondConfig {
    pub const SIZE: usize = 32 + 32 + 2 + 32 + 2 + 8 + 1;
}

#[account]
pub struct ProgramReserve {
    pub lamports_balance: u64,
    pub last_recalc_slot: u64,
    pub bump: u8,
}

impl ProgramReserve {
    pub const SIZE: usize = 8 + 8 + 1;
}

fn compute_reserve_target(
    largest_program_lamports: u64,
    optional_extra_lamports: u64,
) -> Result<u64> {
    let two_x = largest_program_lamports
        .checked_mul(2)
        .ok_or(error!(RentBondError::MathOverflow))?;
    let with_buffer = two_x
        .checked_add(BUFFER_LAMPORTS)
        .ok_or(error!(RentBondError::MathOverflow))?;
    let with_extra = with_buffer
        .checked_add(optional_extra_lamports)
        .ok_or(error!(RentBondError::MathOverflow))?;
    Ok(with_extra.max(MIN_RESERVE_LAMPORTS))
}

#[error_code]
pub enum RentBondError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Reserve account would fall below rent exemption")]
    ReserveRentViolation,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserve_formula_respects_floor() {
        let target = compute_reserve_target(1_000_000_000, 0).unwrap();
        assert_eq!(target, MIN_RESERVE_LAMPORTS);
    }

    #[test]
    fn reserve_formula_scales_with_largest_plus_extra() {
        let largest = 4_000_000_000u64;
        let extra = 500_000_000u64;
        let target = compute_reserve_target(largest, extra).unwrap();
        assert_eq!(target, 9_500_000_000u64);
    }
}
