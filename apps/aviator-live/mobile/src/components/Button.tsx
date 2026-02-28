import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../constants/Colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const backgroundColor = (() => {
    if (disabled) return Colors.surfaceSoft;
    switch (variant) {
      case 'primary':
        return Colors.accent;
      case 'secondary':
        return Colors.surfaceSoft;
      case 'danger':
        return Colors.danger;
      case 'success':
        return Colors.success;
      case 'outline':
        return 'transparent';
      default:
        return Colors.accent;
    }
  })();

  const color = variant === 'outline' ? Colors.accent : '#00131f';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: Colors.accent,
          opacity: pressed || loading || disabled ? 0.7 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Text style={[styles.text, { color }, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    fontSize: 14,
  },
});

