/**
 * ABCRummy — Brand Color System
 * Dark-first premium gaming aesthetic
 */

const tintColorLight = '#6C5CE7';
const tintColorDark = '#A29BFE';

export default {
  light: {
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    background: '#F8F9FA',
    card: '#FFFFFF',
    tint: tintColorLight,
    tabIconDefault: '#9CA3AF',
    tabIconSelected: tintColorLight,
    border: '#E5E7EB',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    accent: '#FF6B6B',
    gold: '#FFD700',
  },
  dark: {
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    background: '#0F0F23',
    card: '#1A1A2E',
    tint: tintColorDark,
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorDark,
    border: '#2D2D44',
    success: '#34D399',
    error: '#F87171',
    warning: '#FBBF24',
    accent: '#FF6B6B',
    gold: '#FFD700',
  },
};
