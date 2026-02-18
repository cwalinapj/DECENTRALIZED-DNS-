use anchor_lang::prelude::*;

declare_id!("DWV9QLGWmsrteqpbKb55JmHTsdtqgLukvnzQgEq36pQ9");

const BONUS_DENOM: u128 = 10_000;
const MAX_BONUS_BPS: u16 = 2_000; // +20%

#[program]
pub mod ddns_rep {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn init_rep_config(
        ctx: Context<InitRepConfig>,
        epoch_len_slots: u64,
        daily_rep_cap_per_miner: u64,
        min_bond_lamports: u64,
        min_unique_name_hashes: u32,
        min_unique_colos: u16,
        rep_per_valid_aggregate: u64,
        rep_decay_per_epoch: u64,
        cooldown_slots: u64,
        enabled: bool,
    ) -> Result<()> {
        require!(epoch_len_slots > 0, RepError::InvalidConfig);

        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.epoch_len_slots = epoch_len_slots;
        cfg.daily_rep_cap_per_miner = daily_rep_cap_per_miner;
        cfg.min_bond_lamports = min_bond_lamports;
        cfg.min_unique_name_hashes = min_unique_name_hashes;
        cfg.min_unique_colos = min_unique_colos;
        cfg.rep_per_valid_aggregate = rep_per_valid_aggregate;
        cfg.rep_decay_per_epoch = rep_decay_per_epoch;
        cfg.cooldown_slots = cooldown_slots;
        cfg.enabled = enabled;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_enabled(ctx: Context<SetEnabled>, enabled: bool) -> Result<()> {
        ctx.accounts.config.enabled = enabled;
        Ok(())
    }

    pub fn deposit_rep_bond(ctx: Context<DepositRepBond>, lamports: u64) -> Result<()> {
        require!(lamports > 0, RepError::InvalidAmount);
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.miner.key(),
            &ctx.accounts.bond.key(),
            lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.miner.to_account_info(),
                ctx.accounts.bond.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let bond = &mut ctx.accounts.bond;
        bond.miner = ctx.accounts.miner.key();
        bond.bond_lamports = bond
            .bond_lamports
            .checked_add(lamports)
            .ok_or(error!(RepError::MathOverflow))?;
        bond.last_deposit_slot = Clock::get()?.slot;
        bond.bump = ctx.bumps.bond;
        Ok(())
    }

    pub fn withdraw_rep_bond(ctx: Context<WithdrawRepBond>, lamports: u64) -> Result<()> {
        require!(lamports > 0, RepError::InvalidAmount);
        let now = Clock::get()?.slot;

        let cfg = &ctx.accounts.config;
        let current = ctx.accounts.bond.to_account_info().lamports();
        let bond_view = &ctx.accounts.bond;
        require!(
            now >= bond_view.last_deposit_slot.saturating_add(cfg.cooldown_slots),
            RepError::CooldownNotMet
        );
        require!(bond_view.bond_lamports >= lamports, RepError::InsufficientBond);

        let rent = Rent::get()?;
        let min_lamports = rent.minimum_balance(8 + MinerBond::SIZE);
        require!(
            current.saturating_sub(lamports) >= min_lamports,
            RepError::BondRentViolation
        );

        **ctx.accounts.bond.to_account_info().try_borrow_mut_lamports()? -= lamports;
        **ctx.accounts.miner.to_account_info().try_borrow_mut_lamports()? += lamports;

        let bond = &mut ctx.accounts.bond;
        bond.bond_lamports = bond
            .bond_lamports
            .checked_sub(lamports)
            .ok_or(error!(RepError::MathOverflow))?;
        Ok(())
    }

    pub fn award_rep(
        ctx: Context<AwardRep>,
        epoch_id: u64,
        receipts_root: [u8; 32],
        _receipt_count: u32,
        unique_name_hashes: u32,
        unique_colos: u16,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(cfg.enabled, RepError::Disabled);
        require!(
            ctx.accounts.bond.bond_lamports >= cfg.min_bond_lamports,
            RepError::InsufficientBond
        );
        require!(
            unique_name_hashes >= cfg.min_unique_name_hashes,
            RepError::DiversityTooLow
        );
        require!(unique_colos >= cfg.min_unique_colos, RepError::DiversityTooLow);

        let clock = Clock::get()?;
        let now_slot = clock.slot;
        let now_day = day_id(clock.unix_timestamp)?;
        let expected_epoch = now_slot / cfg.epoch_len_slots;
        require!(expected_epoch == epoch_id, RepError::BadEpoch);

        let rep = &mut ctx.accounts.rep;
        if rep.miner == Pubkey::default() {
            rep.miner = ctx.accounts.miner.key();
            rep.rep_today_day_id = now_day;
            rep.bump = ctx.bumps.rep;
        }
        require!(rep.miner == ctx.accounts.miner.key(), RepError::InvalidMiner);

        if rep.last_receipts_root == receipts_root {
            return err!(RepError::DuplicateRoot);
        }
        if rep.last_claim_slot > 0 {
            require!(
                now_slot >= rep.last_claim_slot.saturating_add(cfg.cooldown_slots),
                RepError::CooldownNotMet
            );
        }

        if rep.rep_today_day_id != now_day {
            rep.rep_today_day_id = now_day;
            rep.rep_today = 0;
        }

        if cfg.rep_decay_per_epoch > 0 && rep.last_epoch_seen > 0 && epoch_id > rep.last_epoch_seen {
            let elapsed = epoch_id.saturating_sub(rep.last_epoch_seen);
            let decay = cfg
                .rep_decay_per_epoch
                .saturating_mul(elapsed)
                .min(rep.rep_total);
            rep.rep_total = rep.rep_total.saturating_sub(decay);
        }

        let bonus_bps = compute_diversity_bonus_bps(cfg, unique_name_hashes, unique_colos);
        let raw_award = ((cfg.rep_per_valid_aggregate as u128)
            .checked_mul((BONUS_DENOM + bonus_bps as u128) as u128)
            .ok_or(error!(RepError::MathOverflow))?
            / BONUS_DENOM) as u64;

        let remaining_today = cfg.daily_rep_cap_per_miner.saturating_sub(rep.rep_today);
        let award = raw_award.min(remaining_today);
        require!(award > 0, RepError::DailyCapReached);

        rep.rep_total = rep.rep_total.saturating_add(award);
        rep.rep_today = rep.rep_today.saturating_add(award);
        rep.last_epoch_seen = epoch_id;
        rep.last_claim_slot = now_slot;
        rep.last_receipts_root = receipts_root;

        emit!(RepAwarded {
            miner: ctx.accounts.miner.key(),
            epoch_id,
            awarded: award,
            bonus_bps,
            rep_total: rep.rep_total,
            rep_today: rep.rep_today,
        });

        Ok(())
    }

    pub fn slash_rep_bond(
        ctx: Context<SlashRepBond>,
        slash_lamports: u64,
        strike_inc: u32,
    ) -> Result<()> {
        require!(slash_lamports > 0 || strike_inc > 0, RepError::InvalidAmount);

        let current = ctx.accounts.bond.to_account_info().lamports();
        let bond_view = &ctx.accounts.bond;
        if slash_lamports > 0 {
            require!(bond_view.bond_lamports >= slash_lamports, RepError::InsufficientBond);

            let rent = Rent::get()?;
            let min_lamports = rent.minimum_balance(8 + MinerBond::SIZE);
            require!(
                current.saturating_sub(slash_lamports) >= min_lamports,
                RepError::BondRentViolation
            );

            **ctx.accounts.bond.to_account_info().try_borrow_mut_lamports()? -= slash_lamports;
            **ctx.accounts.slash_destination.to_account_info().try_borrow_mut_lamports()? += slash_lamports;
            let bond = &mut ctx.accounts.bond;
            bond.bond_lamports = bond
                .bond_lamports
                .checked_sub(slash_lamports)
                .ok_or(error!(RepError::MathOverflow))?;
        }

        if strike_inc > 0 {
            let rep = &mut ctx.accounts.rep;
            rep.strikes = rep.strikes.saturating_add(strike_inc);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitRepConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + RepConfig::SIZE,
        seeds = [b"rep_config"],
        bump
    )]
    pub config: Account<'info, RepConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetEnabled<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"rep_config"],
        bump = config.bump,
        has_one = authority @ RepError::Unauthorized,
    )]
    pub config: Account<'info, RepConfig>,
}

#[derive(Accounts)]
pub struct DepositRepBond<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(seeds = [b"rep_config"], bump = config.bump)]
    pub config: Account<'info, RepConfig>,
    #[account(
        init_if_needed,
        payer = miner,
        space = 8 + MinerBond::SIZE,
        seeds = [b"rep_bond", miner.key().as_ref()],
        bump
    )]
    pub bond: Account<'info, MinerBond>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawRepBond<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(seeds = [b"rep_config"], bump = config.bump)]
    pub config: Account<'info, RepConfig>,
    #[account(
        mut,
        seeds = [b"rep_bond", miner.key().as_ref()],
        bump = bond.bump,
        constraint = bond.miner == miner.key() @ RepError::InvalidMiner,
    )]
    pub bond: Account<'info, MinerBond>,
}

#[derive(Accounts)]
pub struct AwardRep<'info> {
    #[account(mut)]
    pub miner: Signer<'info>,
    #[account(seeds = [b"rep_config"], bump = config.bump)]
    pub config: Account<'info, RepConfig>,
    #[account(
        mut,
        seeds = [b"rep_bond", miner.key().as_ref()],
        bump = bond.bump,
        constraint = bond.miner == miner.key() @ RepError::InvalidMiner,
    )]
    pub bond: Account<'info, MinerBond>,
    #[account(
        init_if_needed,
        payer = miner,
        space = 8 + MinerRep::SIZE,
        seeds = [b"miner_rep", miner.key().as_ref()],
        bump
    )]
    pub rep: Account<'info, MinerRep>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SlashRepBond<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"rep_config"],
        bump = config.bump,
        has_one = authority @ RepError::Unauthorized,
    )]
    pub config: Account<'info, RepConfig>,
    /// CHECK: any lamports destination
    #[account(mut)]
    pub slash_destination: UncheckedAccount<'info>,
    /// CHECK: used only as PDA seed target for bond/rep and does not require owner/type checks.
    #[account(mut)]
    pub miner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"rep_bond", miner.key().as_ref()],
        bump = bond.bump,
    )]
    pub bond: Account<'info, MinerBond>,
    #[account(
        mut,
        seeds = [b"miner_rep", miner.key().as_ref()],
        bump = rep.bump,
    )]
    pub rep: Account<'info, MinerRep>,
}

#[account]
pub struct RepConfig {
    pub authority: Pubkey,
    pub epoch_len_slots: u64,
    pub daily_rep_cap_per_miner: u64,
    pub min_bond_lamports: u64,
    pub min_unique_name_hashes: u32,
    pub min_unique_colos: u16,
    pub rep_per_valid_aggregate: u64,
    pub rep_decay_per_epoch: u64,
    pub cooldown_slots: u64,
    pub enabled: bool,
    pub bump: u8,
}

impl RepConfig {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 4 + 2 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct MinerBond {
    pub miner: Pubkey,
    pub bond_lamports: u64,
    pub last_deposit_slot: u64,
    pub bump: u8,
}

impl MinerBond {
    pub const SIZE: usize = 32 + 8 + 8 + 1;
}

#[account]
pub struct MinerRep {
    pub miner: Pubkey,
    pub rep_total: u64,
    pub rep_today: u64,
    pub rep_today_day_id: u64,
    pub last_epoch_seen: u64,
    pub strikes: u32,
    pub last_claim_slot: u64,
    pub last_receipts_root: [u8; 32],
    pub bump: u8,
}

impl MinerRep {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 8 + 4 + 8 + 32 + 1;
}

#[event]
pub struct RepAwarded {
    pub miner: Pubkey,
    pub epoch_id: u64,
    pub awarded: u64,
    pub bonus_bps: u16,
    pub rep_total: u64,
    pub rep_today: u64,
}

#[error_code]
pub enum RepError {
    #[msg("Invalid config")]
    InvalidConfig,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Disabled")]
    Disabled,
    #[msg("Invalid miner")]
    InvalidMiner,
    #[msg("Insufficient bond")]
    InsufficientBond,
    #[msg("Cooldown not met")]
    CooldownNotMet,
    #[msg("Bond rent-exemption violation")]
    BondRentViolation,
    #[msg("Diversity too low")]
    DiversityTooLow,
    #[msg("Daily cap reached")]
    DailyCapReached,
    #[msg("Duplicate receipts root")]
    DuplicateRoot,
    #[msg("Bad epoch")]
    BadEpoch,
}

fn day_id(unix_ts: i64) -> Result<u64> {
    require!(unix_ts >= 0, RepError::InvalidConfig);
    Ok((unix_ts as u64) / 86_400)
}

fn compute_diversity_bonus_bps(cfg: &RepConfig, names: u32, colos: u16) -> u16 {
    let name_excess = names.saturating_sub(cfg.min_unique_name_hashes);
    let colo_excess = colos.saturating_sub(cfg.min_unique_colos);
    let name_bonus = name_excess.saturating_mul(20); // 0.2% per extra unique name
    let colo_bonus = (colo_excess as u32).saturating_mul(100); // 1% per extra colo
    (name_bonus.saturating_add(colo_bonus) as u16).min(MAX_BONUS_BPS)
}
