import { GiftReward } from './delivery-dash.engine';

export interface RewardDefinition {
  label: string;
  description: string;
  accent: string;
  icon: string;
  toast: string;
}

const WHITE_STROKE = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';

export const REWARD_CATALOG: Record<GiftReward, RewardDefinition> = {
  shield: {
    label: 'Redeem Shield', description: 'Absorbs a crash · stack up to 3', accent: '#1FA3B5', toast: 'Shield equipped!',
    icon: `<path d="M12 2 21 5.5v6C21 17 17 20.5 12 22 7 20.5 3 17 3 11.5v-6z" fill="currentColor"/><path d="m8 12 3 3 5-6" fill="none" style="stroke:var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  magnet: {
    label: 'Redeem Magnet', description: 'Grabs gifts from neighbouring lanes · 25s', accent: '#D9381E', toast: 'Magnet on!',
    icon: `<path d="M4 3h6v9a2 2 0 0 0 4 0V3h6v9a8 8 0 0 1-16 0z" fill="currentColor"/><path d="M4 3h6v4H4zM14 3h6v4h-6z" style="fill:#002855"/>`,
  },
  double: {
    label: 'Redeem Double Points', description: 'Every gift is worth 20 points · 25s', accent: '#E5A100', toast: 'Double points!',
    icon: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui, sans-serif" fill="currentColor">2×</text>`,
  },
  jackpot: {
    label: 'Redeem Jackpot', description: 'Gifts are worth 5× for 10 seconds', accent: '#8E44C9', toast: 'Jackpot! 5× gifts!',
    icon: `<path d="m12 2 3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9z" fill="currentColor"/>`,
  },
  ghost: {
    label: 'Redeem Ghost Truck', description: 'Drive straight through hazards · 7s', accent: '#5B7FD6', toast: 'Ghost truck! Drive through anything!',
    icon: `<path d="M5 22V11a7 7 0 0 1 14 0v11l-3.5-3-3.5 3-3.5-3z" fill="currentColor"/><circle cx="9.5" cy="11" r="1.6" style="fill:var(--accent)"/><circle cx="14.5" cy="11" r="1.6" style="fill:var(--accent)"/>`,
  },
  sweeper: {
    label: 'Redeem Road Sweeper', description: 'Clears every hazard ahead instantly', accent: '#2E9B5A', toast: 'Road cleared!',
    icon: `<path d="M4 20 20 4" ${WHITE_STROKE}/><path d="M12 20l3-3M8 16l3-3M16 12l3-3" ${WHITE_STROKE}/>`,
  },
  shower: {
    label: 'Redeem Gift Shower', description: 'Instantly bank 100 gift points', accent: '#ED8B00', toast: '+100 gift points!',
    icon: `<rect x="3" y="10" width="18" height="11" rx="1.5" fill="currentColor"/><path d="M12 10v11M2 7h20v3H2z" style="stroke:var(--accent)" stroke-width="2" fill="currentColor"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" ${WHITE_STROKE} stroke-width="2"/>`,
  },
  mystery: {
    label: 'Redeem Mystery Box', description: 'A surprise boost. Could be anything!', accent: '#D6336C', toast: 'Mystery box!',
    icon: `<text x="12" y="19" text-anchor="middle" font-size="19" font-weight="800" font-family="system-ui, sans-serif" fill="currentColor">?</text>`,
  },
};
