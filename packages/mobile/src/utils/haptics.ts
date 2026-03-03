import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Visual & Interaction Polish: Haptic utility
 * Provides tactile feedback for key game events.
 * Safe for all platforms.
 */
export const triggerHaptic = async (type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'medium') => {
    // Some platforms may not support haptics or library might still be loading
    try {
        switch (type) {
            case 'light':
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                break;
            case 'medium':
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                break;
            case 'heavy':
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                break;
            case 'selection':
                await Haptics.selectionAsync();
                break;
            case 'success':
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                break;
            case 'warning':
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                break;
            case 'error':
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                break;
            default:
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
    } catch (err) {
        // Fallback or ignore if haptics unavailable
        console.debug('Haptic feedback not available');
    }
};
