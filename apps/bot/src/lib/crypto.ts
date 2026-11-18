// Panel API keys are stored with AES-256-GCM. The panel row ID is bound in as
// additional data, so a ciphertext copied onto another row fails to decrypt.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.ts';

const VERSION = 'v1';
const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');

export function encryptSecret(plaintext: string, rowId: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(rowId));
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptSecret(stored: string, rowId: string): string {
	const [version, iv, tag, ciphertext] = stored.split(':');
	if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Unrecognised secret format');
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
	decipher.setAAD(Buffer.from(rowId));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
