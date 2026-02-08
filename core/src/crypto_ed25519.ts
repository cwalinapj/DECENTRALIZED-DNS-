import * as ed from "@noble/ed25519";

// noble/ed25519 needs a SHA-512 implementation wired in.
// @noble/hashes provides it.
import { sha512 } from "@noble/hashes/sha512";
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type Ed25519PublicKey = Uint8Array;  // 32
export type Ed25519SecretKey = Uint8Array;  // 32 seed
export type Ed25519Signature = Uint8Array;  // 64

export async function ed25519KeypairFromSeed(seed32: Uint8Array): Promise<{ pub: Ed25519PublicKey; priv: Ed25519SecretKey }> {
  if (!(seed32 instanceof Uint8Array) || seed32.length !== 32) throw new Error("seed must be 32 bytes");
  const pub = await ed.getPublicKeyAsync(seed32);
  return { pub, priv: seed32 };
}

export async function ed25519Sign(privSeed32: Uint8Array, payload: Uint8Array): Promise<Ed25519Signature> {
  if (privSeed32.length !== 32) throw new Error("priv seed must be 32 bytes");
  return await ed.signAsync(payload, privSeed32);
}

export async function ed25519Verify(pub: Uint8Array, payload: Uint8Array, sig: Uint8Array): Promise<boolean> {
  if (pub.length !== 32) throw new Error("pub must be 32 bytes");
  if (sig.length !== 64) throw new Error("sig must be 64 bytes");
  return await ed.verifyAsync(sig, payload, pub);
}
