import { DatabaseSync } from 'node:sqlite';
import { ensureDataDirectories, paths } from '../config/env.js';

let db = null;

export function getDatabase() {
  if (db) return db;

  ensureDataDirectories();
  db = new DatabaseSync(paths.dbFile);

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS ticket_settings (
      guild_id TEXT PRIMARY KEY,
      panel_channel_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      log_channel_id TEXT NOT NULL,
      staff_role_id TEXT,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      ticket_number INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      category TEXT NOT NULL,
      form_data_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      closed_at TEXT,
      closed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS vocal_settings (
      guild_id TEXT PRIMARY KEY,
      trigger_channel_id TEXT NOT NULL,
      category_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temp_voice_channels (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rules_settings (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      message_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS avis_settings (
      guild_id TEXT PRIMARY KEY,
      panel_channel_id TEXT NOT NULL,
      publish_channel_id TEXT NOT NULL,
      panel_message_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS avis_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      avis_number INTEGER NOT NULL,
      author_id TEXT NOT NULL,
      author_tag TEXT NOT NULL,
      title TEXT,
      description TEXT,
      server_rating INTEGER NOT NULL,
      staff_rating INTEGER NOT NULL,
      message_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getTicketSettings(guildId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT guild_id, panel_channel_id, category_id, log_channel_id, staff_role_id, ticket_counter, updated_at
      FROM ticket_settings
      WHERE guild_id = ?
    `)
    .get(guildId);

  if (!row) return null;

  return {
    guildId: row.guild_id,
    panelChannelId: row.panel_channel_id,
    categoryId: row.category_id,
    logChannelId: row.log_channel_id,
    staffRoleId: row.staff_role_id || null,
    ticketCounter: row.ticket_counter,
    updatedAt: row.updated_at,
  };
}

export function upsertTicketSettings({
  guildId,
  panelChannelId,
  categoryId,
  logChannelId,
  staffRoleId = null,
}) {
  const database = getDatabase();
  const updatedAt = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO ticket_settings (
        guild_id,
        panel_channel_id,
        category_id,
        log_channel_id,
        staff_role_id,
        ticket_counter,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        panel_channel_id = excluded.panel_channel_id,
        category_id = excluded.category_id,
        log_channel_id = excluded.log_channel_id,
        staff_role_id = excluded.staff_role_id,
        updated_at = excluded.updated_at
    `)
    .run(guildId, panelChannelId, categoryId, logChannelId, staffRoleId, updatedAt);

  return getTicketSettings(guildId);
}

export function incrementTicketCounter(guildId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      UPDATE ticket_settings
      SET ticket_counter = ticket_counter + 1
      WHERE guild_id = ?
      RETURNING ticket_counter
    `)
    .get(guildId);

  return row ? row.ticket_counter : null;
}

export function createTicketRecord({
  channelId,
  guildId,
  ticketNumber,
  ownerId,
  category,
  formData,
}) {
  const database = getDatabase();
  const createdAt = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO tickets (
        channel_id,
        guild_id,
        ticket_number,
        owner_id,
        category,
        form_data_json,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
    `)
    .run(
      channelId,
      guildId,
      ticketNumber,
      ownerId,
      category,
      JSON.stringify(formData),
      createdAt,
    );

  return getTicketByChannel(channelId);
}

export function getTicketByChannel(channelId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT channel_id, guild_id, ticket_number, owner_id, category, form_data_json, status, created_at, closed_at, closed_by
      FROM tickets
      WHERE channel_id = ?
    `)
    .get(channelId);

  if (!row) return null;

  let formData = [];
  try {
    formData = JSON.parse(row.form_data_json);
  } catch {
    formData = [];
  }

  return {
    channelId: row.channel_id,
    guildId: row.guild_id,
    ticketNumber: row.ticket_number,
    ownerId: row.owner_id,
    category: row.category,
    formData,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at || null,
    closedBy: row.closed_by || null,
  };
}

export function closeTicketRecord(channelId, closedBy) {
  const database = getDatabase();
  const closedAt = new Date().toISOString();

  database
    .prepare(`
      UPDATE tickets
      SET status = 'closed',
          closed_at = ?,
          closed_by = ?
      WHERE channel_id = ?
    `)
    .run(closedAt, closedBy, channelId);

  return getTicketByChannel(channelId);
}

export function getVocalSettings(guildId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT guild_id, trigger_channel_id, category_id, updated_at
      FROM vocal_settings
      WHERE guild_id = ?
    `)
    .get(guildId);

  if (!row) return null;

  return {
    guildId: row.guild_id,
    triggerChannelId: row.trigger_channel_id,
    categoryId: row.category_id || null,
    updatedAt: row.updated_at,
  };
}

export function upsertVocalSettings({
  guildId,
  triggerChannelId,
  categoryId = null,
}) {
  const database = getDatabase();
  const updatedAt = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO vocal_settings (
        guild_id,
        trigger_channel_id,
        category_id,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        trigger_channel_id = excluded.trigger_channel_id,
        category_id = excluded.category_id,
        updated_at = excluded.updated_at
    `)
    .run(guildId, triggerChannelId, categoryId, updatedAt);

  return getVocalSettings(guildId);
}

export function registerTempVoiceChannel({ channelId, guildId, ownerId }) {
  const database = getDatabase();
  const createdAt = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO temp_voice_channels (channel_id, guild_id, owner_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET
        owner_id = excluded.owner_id
    `)
    .run(channelId, guildId, ownerId, createdAt);
}

export function getTempVoiceChannel(channelId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT channel_id, guild_id, owner_id, created_at
      FROM temp_voice_channels
      WHERE channel_id = ?
    `)
    .get(channelId);

  if (!row) return null;

  return {
    channelId: row.channel_id,
    guildId: row.guild_id,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

export function getAllTempVoiceChannels() {
  const database = getDatabase();
  return database
    .prepare(`
      SELECT channel_id, guild_id, owner_id, created_at
      FROM temp_voice_channels
    `)
    .all()
    .map((row) => ({
      channelId: row.channel_id,
      guildId: row.guild_id,
      ownerId: row.owner_id,
      createdAt: row.created_at,
    }));
}

export function removeTempVoiceChannel(channelId) {
  const database = getDatabase();
  database
    .prepare(`DELETE FROM temp_voice_channels WHERE channel_id = ?`)
    .run(channelId);
}

export function getRulesSettings(guildId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT guild_id, channel_id, role_id, message_id, title, content, updated_at
      FROM rules_settings
      WHERE guild_id = ?
    `)
    .get(guildId);

  if (!row) return null;

  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    roleId: row.role_id,
    messageId: row.message_id || null,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

export function upsertRulesSettings({
  guildId,
  channelId,
  roleId,
  messageId = null,
  title,
  content,
}) {
  const database = getDatabase();
  const updatedAt = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO rules_settings (
        guild_id,
        channel_id,
        role_id,
        message_id,
        title,
        content,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        role_id = excluded.role_id,
        message_id = excluded.message_id,
        title = excluded.title,
        content = excluded.content,
        updated_at = excluded.updated_at
    `)
    .run(guildId, channelId, roleId, messageId, title, content, updatedAt);

  return getRulesSettings(guildId);
}

export function getAvisSettings(guildId) {
  const database = getDatabase();
  const row = database
    .prepare(`
      SELECT guild_id, panel_channel_id, publish_channel_id, panel_message_id, updated_at
      FROM avis_settings
      WHERE guild_id = ?
    `)
    .get(guildId);

  if (!row) return null;

  return {
    guildId: row.guild_id,
    panelChannelId: row.panel_channel_id,
    publishChannelId: row.publish_channel_id,
    panelMessageId: row.panel_message_id || null,
    updatedAt: row.updated_at,
  };
}

export function upsertAvisSettings({
  guildId,
  panelChannelId,
  publishChannelId,
  panelMessageId = null,
}) {
  const database = getDatabase();
  const updatedAt = new Date().toISOString();

  database
    .prepare(`
      INSERT INTO avis_settings (
        guild_id,
        panel_channel_id,
        publish_channel_id,
        panel_message_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        panel_channel_id = excluded.panel_channel_id,
        publish_channel_id = excluded.publish_channel_id,
        panel_message_id = excluded.panel_message_id,
        updated_at = excluded.updated_at
    `)
    .run(guildId, panelChannelId, publishChannelId, panelMessageId, updatedAt);

  return getAvisSettings(guildId);
}

export function createAvisEntry({
  guildId,
  authorId,
  authorTag,
  title = null,
  description = null,
  serverRating,
  staffRating,
  messageId = null,
}) {
  const database = getDatabase();
  const createdAt = new Date().toISOString();

  const nextRow = database
    .prepare(`
      SELECT COALESCE(MAX(avis_number), 0) + 1 AS next_avis
      FROM avis_entries
      WHERE guild_id = ?
    `)
    .get(guildId);

  const avisNumber = nextRow ? nextRow.next_avis : 1;

  database
    .prepare(`
      INSERT INTO avis_entries (
        guild_id,
        avis_number,
        author_id,
        author_tag,
        title,
        description,
        server_rating,
        staff_rating,
        message_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      guildId,
      avisNumber,
      authorId,
      authorTag,
      title,
      description,
      serverRating,
      staffRating,
      messageId,
      createdAt,
    );

  return {
    guildId,
    avisNumber,
    authorId,
    authorTag,
    title,
    description,
    serverRating,
    staffRating,
    messageId,
    createdAt,
  };
}
