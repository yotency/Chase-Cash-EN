import fs from 'node:fs/promises';
import path from 'node:path';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

export const BRAND_NAME = 'Chase & Cash';
export const BRAND_COLOR = 0xf5b942;
export const BRAND_LOGO_FILENAME = 'chase-and-cash-logo.png';
export const BRAND_LOGO_URL = `attachment://${BRAND_LOGO_FILENAME}`;

const LOGO_PATH = path.resolve(process.cwd(), 'src/assets', BRAND_LOGO_FILENAME);

let cachedLogoBufferPromise = null;

async function getBrandLogoBuffer() {
  if (!cachedLogoBufferPromise) {
    cachedLogoBufferPromise = fs.readFile(LOGO_PATH).catch((error) => {
      cachedLogoBufferPromise = null;
      throw error;
    });
  }
  return cachedLogoBufferPromise;
}

export async function getBrandLogoAttachment() {
  const buffer = await getBrandLogoBuffer();
  return new AttachmentBuilder(buffer, { name: BRAND_LOGO_FILENAME });
}

export function applyBrandFooter(embed, extraText = '') {
  const text = extraText ? `${BRAND_NAME} • ${extraText}` : BRAND_NAME;
  return embed.setFooter({ text, iconURL: BRAND_LOGO_URL });
}

export function createBrandEmbed({ color = BRAND_COLOR, footerExtra = '', timestamp = true } = {}) {
  const embed = new EmbedBuilder().setColor(color);
  applyBrandFooter(embed, footerExtra);
  if (timestamp) {
    embed.setTimestamp();
  }
  return embed;
}

export async function withBrandAssets(payload) {
  const embeds = payload.embeds || [];
  const needsLogo = embeds.some((embed) => {
    const json = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    return json?.footer?.icon_url === BRAND_LOGO_URL;
  });

  if (!needsLogo) return payload;

  const existingFiles = payload.files ? [...payload.files] : [];
  const alreadyAttached = existingFiles.some(
    (file) => file?.name === BRAND_LOGO_FILENAME,
  );

  if (!alreadyAttached) {
    existingFiles.push(await getBrandLogoAttachment());
  }

  return {
    ...payload,
    files: existingFiles,
  };
}
