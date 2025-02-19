import { SystemProgram, Signer, PublicKey, Keypair, Transaction, Commitment, ConfirmOptions, AccountInfo } from "@solana/web3.js";

import * as token from "@solana/spl-token";
import { BanksClient, BanksTransactionMeta } from "solana-bankrun";

// utils source: https://github.com/kevinheavey/anchor-bankrun

export async function createMint(
  banksClient: BanksClient,
  payer: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  keypair = Keypair.generate(),
  programId = token.TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  let rent = await banksClient.getRent();

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space: token.MINT_SIZE,
      lamports: Number(rent.minimumBalance(BigInt(token.MINT_SIZE))),
      programId: token.TOKEN_PROGRAM_ID,
    }),
    token.createInitializeMint2Instruction(
      keypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority,
      programId
    )
  );
  [tx.recentBlockhash] = (await banksClient.getLatestBlockhash())!;
  tx.sign(payer, keypair);

  await banksClient.processTransaction(tx);

  return keypair.publicKey;
}

export async function createAccount(
  banksClient: BanksClient,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  keypair?: Keypair,
  confirmOptions?: ConfirmOptions,
  programId = token.TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  let rent = await banksClient.getRent();
  // If a keypair isn't provided, create the associated token account and return its address
  if (!keypair)
    return await createAssociatedTokenAccount(
      banksClient,
      payer,
      mint,
      owner,
      programId
    );

  // Otherwise, create the account with the provided keypair and return its public key
  const mintState = await getMint(
    banksClient,
    mint,
    confirmOptions?.commitment,
    programId
  );
  const space = token.getAccountLenForMint(mintState);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space,
      lamports: Number(await rent.minimumBalance(BigInt(space))),
      programId,
    }),
    token.createInitializeAccountInstruction(
      keypair.publicKey,
      mint,
      owner,
      programId
    )
  );
  [tx.recentBlockhash] = (await banksClient.getLatestBlockhash())!;
  tx.sign(payer, keypair);

  await banksClient.processTransaction(tx);

  return keypair.publicKey;
}

export async function createAssociatedTokenAccount(
  banksClient: BanksClient,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  programId = token.TOKEN_PROGRAM_ID,
  associatedTokenProgramId = token.ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const associatedToken = token.getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    programId,
    associatedTokenProgramId
  );

  const tx = new Transaction().add(
    token.createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedToken,
      owner,
      mint,
      programId,
      associatedTokenProgramId
    )
  );

  [tx.recentBlockhash] = (await banksClient.getLatestBlockhash())!;
  tx.sign(payer);

  await banksClient.processTransaction(tx);

  return associatedToken;
}

export async function getMint(
  banksClient: BanksClient,
  address: PublicKey,
  commitment?: Commitment,
  programId = token.TOKEN_PROGRAM_ID
): Promise<token.Mint> {
  const info = await banksClient.getAccount(address, commitment);
  return token.unpackMint(address, info as AccountInfo<Buffer>, programId);
}


export async function mintTo(
  banksClient: BanksClient,
  payer: Signer,
  mint: PublicKey,
  destination: PublicKey,
  authority: Signer | PublicKey,
  amount: number | bigint,
  multiSigners: Signer[] = [],
  programId = token.TOKEN_PROGRAM_ID
): Promise<BanksTransactionMeta> {
  const [authorityPublicKey, signers] = getSigners(authority, multiSigners);

  const tx = new Transaction().add(
    token.createMintToInstruction(
      mint,
      destination,
      authorityPublicKey,
      amount,
      multiSigners,
      programId
    )
  );
  [tx.recentBlockhash] = (await banksClient.getLatestBlockhash())!;
  tx.sign(payer, ...signers);

  return await banksClient.processTransaction(tx);
}

export async function transfer(
  banksClient: BanksClient,
  payer: Signer,
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey | Signer,
  amount: number | bigint,
  multiSigners: Signer[] = [],
  programId = token.TOKEN_PROGRAM_ID
): Promise<BanksTransactionMeta> {
  const [ownerPublicKey, signers] = getSigners(owner, multiSigners);

  const tx = new Transaction().add(
    token.createTransferInstruction(
      source,
      destination,
      ownerPublicKey,
      amount,
      multiSigners,
      programId
    )
  );
  [tx.recentBlockhash] = (await banksClient.getLatestBlockhash())!;
  tx.sign(payer, ...signers);

  return await banksClient.processTransaction(tx);
}

export function getSigners(
  signerOrMultisig: Signer | PublicKey,
  multiSigners: Signer[]
): [PublicKey, Signer[]] {
  return signerOrMultisig instanceof PublicKey
    ? [signerOrMultisig, multiSigners]
    : [signerOrMultisig.publicKey, [signerOrMultisig]];
}

export async function getAccount(
  banksClient: BanksClient,
  address: PublicKey,
  commitment?: Commitment,
  programId = token.TOKEN_PROGRAM_ID
): Promise<token.Account> {
  const info = await banksClient.getAccount(address, commitment);
  return token.unpackAccount(address, info as AccountInfo<Buffer>, programId);
}
