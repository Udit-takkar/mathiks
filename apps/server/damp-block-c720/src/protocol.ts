import { encode, decode } from "@msgpack/msgpack";

export { encode, decode };

export async function encryptQuestion(question: {
  expression: string;
  answer: number;
}): Promise<{ encrypted: Uint8Array; key: Uint8Array }> {
  const key = crypto.getRandomValues(new Uint8Array(16));

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", true, [
    "encrypt",
  ]);

  const plainText = new TextEncoder().encode(JSON.stringify(question));
  const cipherText = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plainText,
  );

  const encrypted = new Uint8Array(12 + cipherText.byteLength);
  encrypted.set(iv);
  encrypted.set(new Uint8Array(cipherText), 12);

  return { encrypted, key };
}
