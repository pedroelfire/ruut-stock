import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Spec 02 §4. bcryptjs is pure JS: no native build on Windows or Railway. */
export const BCRYPT_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Hash of a random throwaway value with the same cost as real hashes. Login compares against it
 * when the email does not exist, so the response time does not reveal which emails are registered.
 */
export function createDummyPasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString('hex'));
}
