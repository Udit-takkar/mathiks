export async function decryptQuestion(
  encrypted: Uint8Array,
  key: Uint8Array,
): Promise<{ expression: string; answer: number }> {
  const iv = new Uint8Array(encrypted.slice(0, 12)).buffer as ArrayBuffer;
  const cipherText = new Uint8Array(encrypted.slice(12)).buffer as ArrayBuffer;
  const keyBuffer = new Uint8Array(key).buffer as ArrayBuffer;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    "AES-GCM",
    false,
    ["decrypt"],
  );

  const plainText = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    cipherText,
  );

  return JSON.parse(new TextDecoder().decode(plainText));
}
