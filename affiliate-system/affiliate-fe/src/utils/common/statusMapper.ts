import { getBrandingConfig } from 'config/brandConfig';

const {
  config: { features },
} = getBrandingConfig();

export const statusMapper: Record<string, string> = {
  active: '',
  inactive: '🚫',
  pending: '⏳',
  completed: '✅',
  error: '❌',
  incomplate: features?.hideNonFunctional ? '' : '⚠️',
  // info: "ℹ️",
  default: '',
};
