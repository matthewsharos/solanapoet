use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};
use spl_token::instruction as token_instruction;

entrypoint!(process_instruction);

#[derive(Debug)]
pub enum MarketplaceInstruction {
    /// Lists an NFT for sale
    /// 0. `[signer]` The seller
    /// 1. `[writable]` Seller's token account
    /// 2. `[writable]` Escrow token account
    /// 3. `[writable]` Escrow state account
    /// 4. `[]` NFT mint
    /// 5. `[]` System program
    /// 6. `[]` Token program
    /// 7. `[]` Rent sysvar
    ListNFT { price: u64 },

    /// Purchases a listed NFT
    /// 0. `[signer]` The buyer
    /// 1. `[writable]` The seller
    /// 2. `[writable]` Escrow token account
    /// 3. `[writable]` Buyer's token account
    /// 4. `[writable]` Escrow state account
    /// 5. `[]` NFT mint
    /// 6. `[]` System program
    /// 7. `[]` Token program
    PurchaseNFT { price: u64 },
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = MarketplaceInstruction::unpack(instruction_data)?;

    match instruction {
        MarketplaceInstruction::ListNFT { price } => {
            process_list(program_id, accounts, price)
        }
        MarketplaceInstruction::PurchaseNFT { price } => {
            process_purchase(program_id, accounts, price)
        }
    }
}

fn process_list(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    price: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let seller = next_account_info(account_info_iter)?;
    let seller_token = next_account_info(account_info_iter)?;
    let escrow_token = next_account_info(account_info_iter)?;
    let escrow_state = next_account_info(account_info_iter)?;
    let nft_mint = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let rent = next_account_info(account_info_iter)?;

    // Verify the seller signed the transaction
    if !seller.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Create escrow account
    let (escrow_pda, bump_seed) = Pubkey::find_program_address(
        &[
            b"escrow",
            nft_mint.key.as_ref(),
            seller.key.as_ref(),
        ],
        program_id,
    );

    // Verify escrow account
    if escrow_state.key != &escrow_pda {
        return Err(ProgramError::InvalidArgument);
    }

    // Transfer NFT to escrow
    invoke(
        &token_instruction::transfer(
            token_program.key,
            seller_token.key,
            escrow_token.key,
            seller.key,
            &[],
            1,
        )?,
        &[
            seller_token.clone(),
            escrow_token.clone(),
            seller.clone(),
            token_program.clone(),
        ],
    )?;

    msg!("NFT listed for {} lamports", price);
    Ok(())
}

fn process_purchase(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    price: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let buyer = next_account_info(account_info_iter)?;
    let seller = next_account_info(account_info_iter)?;
    let escrow_token = next_account_info(account_info_iter)?;
    let buyer_token = next_account_info(account_info_iter)?;
    let escrow_state = next_account_info(account_info_iter)?;
    let nft_mint = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;

    // Verify the buyer signed the transaction
    if !buyer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Transfer SOL from buyer to seller
    invoke(
        &system_instruction::transfer(buyer.key, seller.key, price),
        &[
            buyer.clone(),
            seller.clone(),
            system_program.clone(),
        ],
    )?;

    // Transfer NFT from escrow to buyer
    let (escrow_pda, bump_seed) = Pubkey::find_program_address(
        &[
            b"escrow",
            nft_mint.key.as_ref(),
            seller.key.as_ref(),
        ],
        program_id,
    );

    invoke_signed(
        &token_instruction::transfer(
            token_program.key,
            escrow_token.key,
            buyer_token.key,
            &escrow_pda,
            &[],
            1,
        )?,
        &[
            escrow_token.clone(),
            buyer_token.clone(),
            escrow_state.clone(),
            token_program.clone(),
        ],
        &[&[
            b"escrow",
            nft_mint.key.as_ref(),
            seller.key.as_ref(),
            &[bump_seed],
        ]],
    )?;

    msg!("NFT purchased for {} lamports", price);
    Ok(())
}

impl MarketplaceInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        let price = rest
            .get(..8)
            .and_then(|slice| slice.try_into().ok())
            .map(u64::from_le_bytes)
            .ok_or(ProgramError::InvalidInstructionData)?;

        Ok(match tag {
            0 => Self::ListNFT { price },
            1 => Self::PurchaseNFT { price },
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
} 