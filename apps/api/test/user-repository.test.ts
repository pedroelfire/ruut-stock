import { describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import {
  createPrismaUserRepository,
  DuplicateEmailError,
} from '../src/modules/auth/user.repository.js';

/** Only user.create is exercised; the cast keeps the fake minimal without a database. */
function fakePrismaWhoseCreateThrows(error: unknown): PrismaClient {
  const fake = {
    user: {
      create: async () => {
        throw error;
      },
    },
  };
  return fake as unknown as PrismaClient;
}

const input = { email: 'jane@example.com', passwordHash: 'hash' };

describe('createPrismaUserRepository.create', () => {
  it('maps a P2002 unique constraint violation to DuplicateEmailError', async () => {
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.1',
    });
    const repository = createPrismaUserRepository(fakePrismaWhoseCreateThrows(uniqueViolation));

    await expect(repository.create(input)).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it('rethrows any other Prisma error unchanged', async () => {
    const otherError = new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
      code: 'P2003',
      clientVersion: '7.10.1',
    });
    const repository = createPrismaUserRepository(fakePrismaWhoseCreateThrows(otherError));

    await expect(repository.create(input)).rejects.toBe(otherError);
  });
});
