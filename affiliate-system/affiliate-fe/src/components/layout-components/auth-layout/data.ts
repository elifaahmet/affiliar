export type InsightTone = 'sky' | 'emerald' | 'amber';

export interface InsightCard {
  title: string;
  description: string;
  focus: string;
  note: string;
  tone: InsightTone;
}

export const newsData: InsightCard[] = [
  {
    title: 'Partner Network Management',
    description:
      'Organize affiliate relationships with better structure, visibility, and control across your entire partner ecosystem.',
    focus: 'Affiliate operations',
    note: 'Built for scalable partner programs',
    tone: 'sky',
  },
  {
    title: 'Traffic & Conversion Intelligence',
    description:
      'Understand which sources deliver stronger users, better retention, and more valuable conversion behavior over time.',
    focus: 'Performance analytics',
    note: 'Helps you optimize traffic quality',
    tone: 'emerald',
  },
  {
    title: 'Commission Transparency',
    description:
      'Track commission flows with clear oversight, reduce disputes, and maintain a more reliable payout process.',
    focus: 'Revenue control',
    note: 'Improves trust and payout clarity',
    tone: 'amber',
  },
];

export const footerLinks = [
  { label: 'Terms & Conditions', to: '/terms-and-conditions' },
  { label: 'Privacy Policy', to: '/privacy-policy' },
  { label: 'Cookie Policy', to: '/cookie-policy' },
];
