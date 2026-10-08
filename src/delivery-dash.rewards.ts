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
  ghost: {
    label: 'Ghost Truck', description: 'Drive straight through hazards · 7s', accent: '#5B7FD6', toast: 'Ghost truck! Drive through anything!',
    icon: `<path d="M5 22V11a7 7 0 0 1 14 0v11l-3.5-3-3.5 3-3.5-3z" fill="currentColor"/><circle cx="9.5" cy="11" r="1.6" style="fill:var(--accent)"/><circle cx="14.5" cy="11" r="1.6" style="fill:var(--accent)"/>`,
  },
  jackpot: {
    label: 'Jackpot', description: 'Every gift is worth 50 points · 10s', accent: '#8E44C9', toast: 'Jackpot! 50 points a gift!',
    icon: `<path d="m12 2 3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9z" fill="currentColor"/>`,
  },
  rain: {
    label: 'Holiday Gift Shoppe', description: 'Every hazard ahead turns into a gift', accent: '#2E9B5A', toast: 'Holiday Gift Shoppe!',
    icon: `<rect x="3" y="10" width="18" height="11" rx="1.5" fill="currentColor"/><path d="M12 10v11M2 7h20v3H2z" style="stroke:var(--accent)" stroke-width="2" fill="currentColor"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" ${WHITE_STROKE} stroke-width="2"/>`,
  },
  shield: {
    label: 'Shield', description: 'Absorbs one crash · hold up to 3', accent: '#1FA3B5', toast: 'Shield equipped!',
    icon: `<path d="M12 2 21 5.5v6C21 17 17 20.5 12 22 7 20.5 3 17 3 11.5v-6z" fill="currentColor"/><path d="m8 12 3 3 5-6" fill="none" style="stroke:var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  nitro: {
    label: 'Bigger Nitro Tank', description: '+1s of boost per tank', accent: '#F06A1A', toast: 'Nitro tank upgraded!',
    icon: `<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/>`,
  },
  loyalty: {
    label: 'Loyalty Card', description: '+5 points for every gift', accent: '#ED8B00', toast: 'Loyalty card upgraded!',
    icon: `<rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor"/><path d="M2 9h20" style="stroke:var(--accent)" stroke-width="2.4"/><path d="M5 15h6" style="stroke:var(--accent)" stroke-width="2" stroke-linecap="round"/>`,
  },
  magnet: {
    label: 'Black & Decker Dustbuster', description: 'Hoovers up gifts one lane over · 60s', accent: '#D9381E', toast: 'Dustbuster fitted!',
    icon: `<path d="M4 3h6v9a2 2 0 0 0 4 0V3h6v9a8 8 0 0 1-16 0z" fill="currentColor"/><path d="M4 3h6v4H4zM14 3h6v4h-6z" style="fill:#002855"/>`,
  },
  freeplay: {
    label: 'Freeplay', description: 'Cash in all gift points for score at your multiplier', accent: '#E5A100', toast: 'Freeplay!',
    icon: `<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m10 8 6 4-6 4z" style="fill:var(--accent)"/>`,
  },
};
