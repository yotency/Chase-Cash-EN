import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const rawDataDir = process.env.DATA_DIR || './data';

export const env = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  devGuildId: process.env.DEV_GUILD_ID || '',
  dataDir: path.resolve(process.cwd(), rawDataDir),
};

export const paths = {
  dataDir: env.dataDir,
  assetsDir: path.join(env.dataDir, 'assets'),
  dbFile: path.join(env.dataDir, 'chase-and-cash-en.db'),
};

export function ensureDataDirectories() {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.assetsDir, { recursive: true });
}
