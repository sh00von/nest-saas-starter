import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { type Database, InjectDb } from '../../../database/database.module.js';
import {
  type VerificationTokenType,
  verificationTokens,
} from '../../../database/schema/index.js';
import { hashToken, randomToken } from '../../../common/crypto/tokens.js';

const TTL_MS: Record<VerificationTokenType, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

/** Issues and redeems the single-use tokens behind email links. */
@Injectable()
export class EmailTokenService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Creates a token, replacing any earlier one of the same type. */
  async issue(userId: string, type: VerificationTokenType): Promise<string> {
    const token = randomToken();
    await this.db.transaction(async (tx) => {
      await tx
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.userId, userId),
            eq(verificationTokens.type, type),
          ),
        );
      await tx.insert(verificationTokens).values({
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TTL_MS[type]),
      });
    });
    return token;
  }

  /** Deletes the token and returns its user; a token works exactly once. */
  async consume(token: string, type: VerificationTokenType): Promise<string> {
    const [row] = await this.db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.tokenHash, hashToken(token)),
          eq(verificationTokens.type, type),
          gt(verificationTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: verificationTokens.userId });
    if (!row) throw new BadRequestException('Invalid or expired link');
    return row.userId;
  }
}
