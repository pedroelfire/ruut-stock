import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

/** Thrown by `create` when the email is already taken (also covers two concurrent registrations). */
export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'DuplicateEmailError';
  }
}

/**
 * Persistence boundary of the auth module. createApp receives an implementation,
 * so tests run against an in-memory one without a database.
 */
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
}

const userSelect = { id: true, email: true, passwordHash: true } as const;

// Unique constraint violation, see https://www.prisma.io/docs/orm/reference/error-reference
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export function createPrismaUserRepository(prisma: PrismaClient): UserRepository {
  return {
    findByEmail: (email) => prisma.user.findUnique({ where: { email }, select: userSelect }),
    findById: (id) => prisma.user.findUnique({ where: { id }, select: userSelect }),
    async create(input) {
      try {
        return await prisma.user.create({ data: input, select: userSelect });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_CONSTRAINT_VIOLATION
        ) {
          throw new DuplicateEmailError();
        }
        throw error;
      }
    },
  };
}
