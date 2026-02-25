import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { Colors } from '../constants/Colors';

interface HeaderProps {
    title: string;
    subtitle?: string;
    balance?: number;
    onBack?: () => void;
    showBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, balance, onBack, showBack }) => {
    return (
        <View style={styles.container}>
            <View style={styles.topRow}>
                <View style={styles.left}>
                    {showBack && (
                        <Pressable
                            onPress={onBack}
                            style={({ pressed }) => [
                                styles.backButton,
                                { opacity: pressed ? 0.7 : 1 }
                            ]}
                        >
                            <Text style={styles.backText}>←</Text>
                        </Pressable>
                    )}
                    <View>
                        <Text style={styles.title}>{title}</Text>
                        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    </View>
                </View>

                {balance !== undefined && (
                    <View style={styles.wallet}>
                        <Text style={styles.walletLabel}>Balance</Text>
                        <Text style={styles.balanceText}>₹ {(balance || 0).toFixed(2)}</Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: Colors.background,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        marginRight: 12,
        padding: 4,
    },
    backText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    subtitle: {
        color: Colors.textMuted,
        fontSize: 12,
    },
    wallet: {
        backgroundColor: Colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        alignItems: 'flex-end',
    },
    walletLabel: {
        color: Colors.textMuted,
        fontSize: 10,
    },
    balanceText: {
        color: Colors.gold,
        fontWeight: 'bold',
        fontSize: 14,
    },
});
