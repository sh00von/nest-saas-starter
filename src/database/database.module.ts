import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Env } from '../config/env.js';
import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;

export const DB = Symbol('DB');
const PG_CLIENT = Symbol('PG_CLIENT');

/** Inject the Drizzle client: `constructor(@InjectDb() private db: Database)` */
export const InjectDb = () => Inject(DB);

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        postgres(config.get('DATABASE_URL', { infer: true }), {
          max: config.get('DATABASE_POOL_MAX', { infer: true }),
        }),
    },
    {
      provide: DB,
      inject: [PG_CLIENT],
      useFactory: (client: postgres.Sql): Database =>
        drizzle(client, { schema, casing: 'snake_case' }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown() {
    await this.client.end({ timeout: 5 });
  }
}
