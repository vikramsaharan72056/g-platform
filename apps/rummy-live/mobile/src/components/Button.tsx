import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, Platform } from 'react-native';
import { Colors } from '../constants/Colors';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
    size?: 'small' | 'medium' | 'large';
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    size = 'medium',
    loading = false,
    disabled = false,
    style,
    textStyle,
}) => {
    const getBackgroundColor = () => {
        if (disabled) return Colors.surface;
        switch (variant) {
            case 'primary': return Colors.primary;
            case 'secondary': return Colors.surface;
            case 'danger': return Colors.danger;
            case 'success': return Colors.success;
            case 'outline': return 'transparent';
            default: return Colors.primary;
        }
    };

    const getBorderColor = () => {
        if (variant === 'outline') return Colors.primary;
        return 'transparent';
    };

    const getTextColor = () => {
        if (variant === 'outline') return Colors.primary;
        return Colors.text;
    };

    const getPadding = () => {
        switch (size) {
            case 'small': return { paddingVertical: 6, paddingHorizontal: 12 };
            case 'large': return { paddingVertical: 14, paddingHorizontal: 24 };
            default: return { paddingVertical: 10, paddingHorizontal: 18 };
        }
    };

    return (
        <Pressable
            disabled={disabled || loading}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ disabled: disabled || loading }}
            style={({ pressed }) => [
                styles.button,
                {
                    backgroundColor: getBackgroundColor(),
                    borderColor: getBorderColor(),
                    borderWidth: variant === 'outline' ? 1 : 0,
                    opacity: pressed || disabled || loading ? 0.7 : 1,
                },
                getPadding(),
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={Colors.text} size="small" />
            ) : (
                <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    button: {
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    text: {
        fontSize: 14,
        fontWeight: '600',
    },
});
