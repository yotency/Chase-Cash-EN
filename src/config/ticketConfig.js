import { TextInputStyle } from 'discord.js';

export const TICKET_SELECT_ID = 'ticket_category_select';
export const TICKET_MODAL_PREFIX = 'ticket_modal:';
export const TICKET_CLOSE_REQUEST_ID = 'ticket_close_request';
export const TICKET_CLOSE_CONFIRM_ID = 'ticket_close_confirm';
export const TICKET_CLOSE_CANCEL_ID = 'ticket_close_cancel';
export const TICKET_ADD_MEMBER_BTN_ID = 'ticket_add_member_btn';
export const TICKET_REMOVE_MEMBER_BTN_ID = 'ticket_remove_member_btn';
export const TICKET_ADD_MEMBER_SELECT_ID = 'ticket_add_member_select';
export const TICKET_REMOVE_MEMBER_SELECT_ID = 'ticket_remove_member_select';

export const TICKET_CATEGORIES = {
  support: {
    key: 'support',
    label: 'Support Request',
    description: 'General or technical assistance in-game or on Discord',
    emoji: '🆘',
    channelPrefix: 'support',
    modalTitle: 'Ticket — Support Request',
    fields: [
      {
        id: 'ingame_name',
        label: 'In-game name',
        style: TextInputStyle.Short,
        required: true,
        minLength: 2,
        maxLength: 64,
        placeholder: 'e.g. John_Doe',
      },
      {
        id: 'description',
        label: 'Describe your request (min. 40 characters)',
        style: TextInputStyle.Paragraph,
        required: true,
        minLength: 40,
        maxLength: 1500,
        placeholder: 'Explain your issue in detail (minimum 40 characters)...',
      },
      {
        id: 'media_link',
        label: 'Image or video link (optional)',
        style: TextInputStyle.Short,
        required: false,
        maxLength: 300,
        placeholder: 'https://...',
      },
    ],
  },
  report: {
    key: 'report',
    label: 'Player Report',
    description: 'Report a player, behavior, or rule violation',
    emoji: '🚨',
    channelPrefix: 'report',
    modalTitle: 'Ticket — Player Report',
    fields: [
      {
        id: 'ingame_name',
        label: 'Your in-game name',
        style: TextInputStyle.Short,
        required: true,
        minLength: 2,
        maxLength: 64,
        placeholder: 'e.g. John_Doe',
      },
      {
        id: 'reported_player',
        label: 'Reported player name (optional)',
        style: TextInputStyle.Short,
        required: false,
        maxLength: 64,
        placeholder: 'Username / in-game name of the reported player',
      },
      {
        id: 'description',
        label: 'Explain your report (min. 40 chars)',
        style: TextInputStyle.Paragraph,
        required: true,
        minLength: 40,
        maxLength: 1500,
        placeholder: 'Describe what happened with as much detail as possible (min. 40 chars)...',
      },
      {
        id: 'media_link',
        label: 'Image or video proof link (optional)',
        style: TextInputStyle.Short,
        required: false,
        maxLength: 300,
        placeholder: 'https://...',
      },
    ],
  },
  tebex: {
    key: 'tebex',
    label: 'Tebex',
    description: 'Issue or question regarding a Tebex store purchase',
    emoji: '💳',
    channelPrefix: 'tebex',
    modalTitle: 'Ticket — Tebex Support',
    fields: [
      {
        id: 'transaction_id',
        label: 'Tebex Transaction ID',
        style: TextInputStyle.Short,
        required: true,
        minLength: 3,
        maxLength: 100,
        placeholder: 'e.g. tbx-12345678a90b12-345678',
      },
      {
        id: 'description',
        label: 'Describe your issue (min. 40 characters)',
        style: TextInputStyle.Paragraph,
        required: true,
        minLength: 40,
        maxLength: 1500,
        placeholder: 'Describe your issue with your Tebex purchase (minimum 40 characters)...',
      },
      {
        id: 'media_link',
        label: 'Image or video link (optional)',
        style: TextInputStyle.Short,
        required: false,
        maxLength: 300,
        placeholder: 'https://...',
      },
    ],
  },
  partnership: {
    key: 'partnership',
    label: 'Partnership (Twitch, YouTube...)',
    description: 'Propose a content creator or community partnership',
    emoji: '🤝',
    channelPrefix: 'partner',
    modalTitle: 'Ticket — Partnership',
    fields: [
      {
        id: 'ingame_name',
        label: 'In-game name',
        style: TextInputStyle.Short,
        required: true,
        minLength: 2,
        maxLength: 64,
        placeholder: 'e.g. John_Doe',
      },
      {
        id: 'description',
        label: 'Tell us about your project (min. 40 chars)',
        style: TextInputStyle.Paragraph,
        required: true,
        minLength: 40,
        maxLength: 1500,
        placeholder: 'Present your partnership proposal (minimum 40 characters)...',
      },
      {
        id: 'media_link',
        label: 'Discord, YouTube, or Twitch link (optional)',
        style: TextInputStyle.Short,
        required: false,
        maxLength: 300,
        placeholder: 'https://twitch.tv/... or https://discord.gg/...',
      },
    ],
  },
};

export function getTicketCategory(key) {
  return TICKET_CATEGORIES[key] || null;
}
