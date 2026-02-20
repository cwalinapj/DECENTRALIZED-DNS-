use anchor_lang::prelude::*;

declare_id!("DqSgwiSrtjjMEHoHNYpLpyp92yjruBTt6u7CYyhzyEbK");

const MAX_VERIFIERS: usize = 64;

#[program]
pub mod ddns_quorum {
    use super::*;

    pub fn init_quorum_authority(ctx: Context<InitQuorumAuthority>) -> Result<()> {
        let qa = &mut ctx.accounts.quorum_authority;
        qa.bump = ctx.bumps.quorum_authority;
        Ok(())
    }

    pub fn init_verifier_set(
        ctx: Context<InitVerifierSet>,
        epoch_id: u64,
        threshold_stake_weight: u64,
        members: Vec<Pubkey>,
    ) -> Result<()> {
        require!(members.len() <= MAX_VERIFIERS, QuorumError::TooManyVerifiers);

        let vs = &mut ctx.accounts.verifier_set;
        vs.epoch_id = epoch_id;
        vs.admin = ctx.accounts.admin.key();
        vs.threshold_stake_weight = threshold_stake_weight;
        vs.members = members;
        vs.bump = ctx.bumps.verifier_set;
        Ok(())
    }

    pub fn update_verifier_set(
        ctx: Context<UpdateVerifierSet>,
        threshold_stake_weight: u64,
        members: Vec<Pubkey>,
    ) -> Result<()> {
        require!(members.len() <= MAX_VERIFIERS, QuorumError::TooManyVerifiers);
        let vs = &mut ctx.accounts.verifier_set;
        vs.threshold_stake_weight = threshold_stake_weight;
        vs.members = members;
        Ok(())
    }

    pub fn submit_stake_snapshot(
        ctx: Context<SubmitStakeSnapshot>,
        epoch_id: u64,
        user_stake_root: [u8; 32],
        total_stake: u64,
    ) -> Result<()> {
        require_is_member(&ctx.accounts.verifier_set, &ctx.accounts.submitter.key())?;

        let current_epoch =
            epoch_id_from_slot(Clock::get()?.slot, ctx.accounts.registry_config.epoch_len_slots)?;
        require!(current_epoch == epoch_id, QuorumError::WrongEpoch);

        let snap = &mut ctx.accounts.stake_snapshot;
        snap.epoch_id = epoch_id;
        snap.total_stake = total_stake;
        snap.user_stake_root = user_stake_root;
        snap.created_at_slot = Clock::get()?.slot;
        snap.bump = ctx.bumps.stake_snapshot;
        Ok(())
    }

    pub fn submit_aggregate(
        ctx: Context<SubmitAggregate>,
        epoch_id: u64,
        name_hash: [u8; 32],
        dest_hash: [u8; 32],
        ttl_s: u32,
        receipt_count: u32,
        stake_weight: u64,
        receipts_root: [u8; 32],
    ) -> Result<()> {
        require_is_member(&ctx.accounts.verifier_set, &ctx.accounts.submitter.key())?;

        let current_epoch =
            epoch_id_from_slot(Clock::get()?.slot, ctx.accounts.registry_config.epoch_len_slots)?;
        require!(current_epoch == epoch_id, QuorumError::WrongEpoch);

        let agg = &mut ctx.accounts.aggregate;
        agg.epoch_id = epoch_id;
        agg.name_hash = name_hash;
        agg.dest_hash = dest_hash;
        agg.ttl_s = ttl_s;
        agg.receipt_count = receipt_count;
        agg.stake_weight = stake_weight;
        agg.receipts_root = receipts_root;
        agg.submitter = ctx.accounts.submitter.key();
        agg.submitted_at_slot = Clock::get()?.slot;
        agg.bump = ctx.bumps.aggregate;
        Ok(())
    }

    pub fn finalize_if_quorum(
        ctx: Context<FinalizeIfQuorum>,
        epoch_id: u64,
        name_hash: [u8; 32],
        dest_hash: [u8; 32],
        ttl_s: u32,
    ) -> Result<()> {
        let cfg = &ctx.accounts.registry_config;
        let vs = &ctx.accounts.verifier_set;
        let agg = &ctx.accounts.aggregate;

        require!(vs.epoch_id == epoch_id, QuorumError::WrongEpoch);
        require!(agg.epoch_id == epoch_id, QuorumError::WrongEpoch);
        require!(agg.name_hash == name_hash, QuorumError::AggregateMismatch);
        require!(agg.dest_hash == dest_hash, QuorumError::AggregateMismatch);
        require!(agg.ttl_s == ttl_s, QuorumError::AggregateMismatch);

        // Ensure the aggregate is from the current epoch and not stale.
        let current_epoch = epoch_id_from_slot(Clock::get()?.slot, cfg.epoch_len_slots)?;
        require!(current_epoch == epoch_id, QuorumError::WrongEpoch);

        require!(
            agg.receipt_count >= cfg.min_receipts,
            QuorumError::NotEnoughReceipts
        );

        let required_weight = cfg.min_stake_weight.max(vs.threshold_stake_weight);
        require!(
            agg.stake_weight >= required_weight,
            QuorumError::NotEnoughStakeWeight
        );

        // CPI to ddns_registry.finalize_route using the ddns_quorum PDA as signer.
        let qa_seeds: &[&[u8]] = &[b"quorum_authority", &[ctx.accounts.quorum_authority.bump]];
        let signer_seeds: &[&[&[u8]]] = &[qa_seeds];

        let cpi_program = ctx.accounts.ddns_registry_program.to_account_info();
        let cpi_accounts = ddns_registry::cpi::accounts::FinalizeRoute {
            payer: ctx.accounts.payer.to_account_info(),
            finalize_authority: ctx.accounts.quorum_authority.to_account_info(),
            config: ctx.accounts.registry_config.to_account_info(),
            canonical_route: ctx.accounts.canonical_route.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        ddns_registry::cpi::finalize_route(
            cpi_ctx,
            name_hash,
            dest_hash,
            ttl_s,
            ctx.accounts.aggregate.key(),
        )?;

        Ok(())
    }
}

fn epoch_id_from_slot(slot: u64, epoch_len_slots: u64) -> Result<u64> {
    require!(epoch_len_slots > 0, QuorumError::BadEpochLen);
    Ok(slot / epoch_len_slots)
}

fn require_is_member(vs: &VerifierSet, key: &Pubkey) -> Result<()> {
    require!(vs.members.iter().any(|k| k == key), QuorumError::NotVerifier);
    Ok(())
}

#[derive(Accounts)]
pub struct InitQuorumAuthority<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + QuorumAuthority::SIZE,
        seeds = [b"quorum_authority"],
        bump
    )]
    pub quorum_authority: Account<'info, QuorumAuthority>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct InitVerifierSet<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + VerifierSet::SIZE,
        seeds = [b"verifierset", epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub verifier_set: Account<'info, VerifierSet>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct UpdateVerifierSet<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"verifierset", epoch_id.to_le_bytes().as_ref()],
        bump = verifier_set.bump,
        has_one = admin
    )]
    pub verifier_set: Account<'info, VerifierSet>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct SubmitStakeSnapshot<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = registry_config.bump,
        seeds::program = ddns_registry_program.key()
    )]
    pub registry_config: Account<'info, ddns_registry::Config>,

    #[account(
        seeds = [b"verifierset", epoch_id.to_le_bytes().as_ref()],
        bump = verifier_set.bump
    )]
    pub verifier_set: Account<'info, VerifierSet>,

    #[account(
        init,
        payer = submitter,
        space = 8 + StakeSnapshot::SIZE,
        seeds = [b"stake_snapshot", epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub stake_snapshot: Account<'info, StakeSnapshot>,

    pub ddns_registry_program: Program<'info, ddns_registry::program::DdnsRegistry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, name_hash: [u8;32])]
pub struct SubmitAggregate<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = registry_config.bump,
        seeds::program = ddns_registry_program.key()
    )]
    pub registry_config: Account<'info, ddns_registry::Config>,

    #[account(
        seeds = [b"verifierset", epoch_id.to_le_bytes().as_ref()],
        bump = verifier_set.bump
    )]
    pub verifier_set: Account<'info, VerifierSet>,

    #[account(
        init,
        payer = submitter,
        space = 8 + AggregateSubmission::SIZE,
        seeds = [b"agg", epoch_id.to_le_bytes().as_ref(), name_hash.as_ref(), submitter.key().as_ref()],
        bump
    )]
    pub aggregate: Account<'info, AggregateSubmission>,

    pub ddns_registry_program: Program<'info, ddns_registry::program::DdnsRegistry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, name_hash: [u8;32])]
pub struct FinalizeIfQuorum<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = registry_config.bump,
        seeds::program = ddns_registry_program.key()
    )]
    pub registry_config: Account<'info, ddns_registry::Config>,

    #[account(
        seeds = [b"verifierset", epoch_id.to_le_bytes().as_ref()],
        bump = verifier_set.bump
    )]
    pub verifier_set: Account<'info, VerifierSet>,

    #[account(
        seeds = [b"agg", epoch_id.to_le_bytes().as_ref(), name_hash.as_ref(), aggregate.submitter.as_ref()],
        bump = aggregate.bump
    )]
    pub aggregate: Account<'info, AggregateSubmission>,

    // This PDA is the signer that ddns_registry trusts for finalization.
    #[account(seeds = [b"quorum_authority"], bump = quorum_authority.bump)]
    pub quorum_authority: Account<'info, QuorumAuthority>,

    // CanonicalRoute PDA lives in ddns_registry; ddns_registry enforces seeds on CPI.
    /// CHECK: seeds/owner enforced by ddns_registry during CPI
    #[account(mut)]
    pub canonical_route: UncheckedAccount<'info>,

    pub ddns_registry_program: Program<'info, ddns_registry::program::DdnsRegistry>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct QuorumAuthority {
    pub bump: u8,
}

impl QuorumAuthority {
    pub const SIZE: usize = 1;
}

#[account]
pub struct VerifierSet {
    pub epoch_id: u64,
    pub admin: Pubkey,
    pub threshold_stake_weight: u64,
    pub members: Vec<Pubkey>,
    pub bump: u8,
}

impl VerifierSet {
    pub const SIZE: usize = 8 + 32 + 8 + 4 + (MAX_VERIFIERS * 32) + 1;
}

#[account]
pub struct StakeSnapshot {
    pub epoch_id: u64,
    pub total_stake: u64,
    pub user_stake_root: [u8; 32],
    pub created_at_slot: u64,
    pub bump: u8,
}

impl StakeSnapshot {
    pub const SIZE: usize = 8 + 8 + 32 + 8 + 1;
}

#[account]
pub struct AggregateSubmission {
    pub epoch_id: u64,
    pub name_hash: [u8; 32],
    pub dest_hash: [u8; 32],
    pub ttl_s: u32,
    pub receipt_count: u32,
    pub stake_weight: u64,
    pub receipts_root: [u8; 32],
    pub submitter: Pubkey,
    pub submitted_at_slot: u64,
    pub bump: u8,
}

impl AggregateSubmission {
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 4 + 8 + 32 + 32 + 8 + 1;
}

#[error_code]
pub enum QuorumError {
    #[msg("Too many verifiers.")]
    TooManyVerifiers,
    #[msg("Not a verifier.")]
    NotVerifier,
    #[msg("Wrong epoch.")]
    WrongEpoch,
    #[msg("Aggregate fields do not match requested finalize.")]
    AggregateMismatch,
    #[msg("Not enough receipts.")]
    NotEnoughReceipts,
    #[msg("Not enough stake weight.")]
    NotEnoughStakeWeight,
    #[msg("Bad epoch length.")]
    BadEpochLen,
}
