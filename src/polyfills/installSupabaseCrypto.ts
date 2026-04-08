import * as ExpoCrypto from "expo-crypto";
import { Platform } from "react-native";

function bufferSourceToUint8(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Supabase PKCE uses `crypto.subtle.digest('SHA-256', ...)` (@supabase/auth-js helpers).
 * React Native often has no `crypto.subtle`, which triggers plain PKCE and can break OAuth.
 * `expo-crypto` implements SHA-256 natively — we expose it as `crypto.subtle.digest` only.
 */
export function installSupabaseCryptoPolyfill(): void {
  if (Platform.OS === "web") return;

  const hasSubtleDigest =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined" &&
    typeof globalThis.crypto.subtle.digest === "function";

  if (hasSubtleDigest) {
    return;
  }

  if (typeof globalThis.crypto === "undefined") {
    globalThis.crypto = {} as Crypto;
  }

  const c = globalThis.crypto as Crypto;
  if (!c.getRandomValues) {
    c.getRandomValues = ExpoCrypto.getRandomValues.bind(ExpoCrypto) as typeof c.getRandomValues;
  }

  if (!c.subtle) {
    const subtle: Partial<SubtleCrypto> = {
      async digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
        const name = typeof algorithm === "string" ? algorithm : algorithm.name;
        if (name !== "SHA-256") {
          throw new Error(`installSupabaseCryptoPolyfill: unsupported digest ${name}`);
        }
        const input = bufferSourceToUint8(data);
        // expo-crypto digest() typings expect expo-modules TypedArray brands; values are plain Uint8Array.
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, input as never);
      },
    };
    (c as Crypto & { subtle: SubtleCrypto }).subtle = subtle as SubtleCrypto;
  }
}
