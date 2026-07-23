import { argon2d, argon2id } from 'hash-wasm';
import * as kdbxweb from 'kdbxweb';

/**
 * Registers a WASM Argon2 implementation for kdbxweb (KDBX4 KDF).
 * kdbxweb passes the Argon2 variant as: 0 = Argon2d, 2 = Argon2id.
 */
export function registerArgon2(): void {
  kdbxweb.CryptoEngine.setArgon2Impl(async (
    password,
    salt,
    memory,
    iterations,
    length,
    parallelism,
    type,
  ) => {
    const params = {
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      parallelism,
      iterations,
      memorySize: memory,
      hashLength: length,
      outputType: 'binary' as const,
    };
    const hash = type === 0 ? await argon2d(params) : await argon2id(params);
    return hash.buffer as ArrayBuffer;
  });
}
