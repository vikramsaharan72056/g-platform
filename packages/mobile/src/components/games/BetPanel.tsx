import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { BetOption } from './types';
import { triggerHaptic } from '../../utils/haptics';

interface BetPanelProps {
    options: BetOption[];
    selectedBet: string | null;
    onSelectBet: (type: string) => void;
    betAmount: string;
    onAmountChange: (amount: string) => void;
    onPlaceBet: () => void;
    disabled?: boolean;
}

export const BetPanel: React.FC<BetPanelProps> = ({
    options,
    selectedBet,
    onSelectBet,
    betAmount,
    onAmountChange,
    onPlaceBet,
    disabled,
}) => {
    return (
        <View style={styles.betSection}>
            <Text style={styles.sectionTitle}>Place Your Bet</Text>

            <View style={styles.betOptions}>
                {options.map((opt) => (
                    <TouchableOpacity
                        key={opt.type}
                        style={[
                            styles.betCard,
                            { borderColor: opt.color },
                            selectedBet === opt.type && { backgroundColor: opt.color + '30', borderWidth: 2 },
                        ]}
                        onPress={() => {
                            triggerHaptic('selection');
                            onSelectBet(opt.type);
                        }}
                        disabled={disabled}
                    >
                        <Text style={styles.betEmoji}>{opt.emoji}</Text>
                        <Text style={styles.betLabel}>{opt.label}</Text>
                        <Text style={[styles.betOdds, { color: opt.color }]}>{opt.odds}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Amount Input */}
            <View style={styles.amountRow}>
                <TextInput
                    style={styles.amountInput}
                    value={betAmount}
                    onChangeText={onAmountChange}
                    keyboardType="numeric"
                    placeholder="Amount"
                    placeholderTextColor="#666"
                    editable={!disabled}
                />
                {[50, 100, 500, 1000].map((val) => (
                    <TouchableOpacity
                        key={val}
                        style={styles.quickBtn}
                        onPress={() => {
                            triggerHaptic('light');
                            onAmountChange(val.toString());
                        }}
                        disabled={disabled}
                    >
                        <Text style={styles.quickBtnText}>₹{val}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity
                style={[styles.placeBetBtn, (!selectedBet || disabled) && styles.disabledBtn]}
                onPress={() => {
                    triggerHaptic('medium');
                    onPlaceBet();
                }}
                disabled={!selectedBet || disabled}
            >
                <Text style={styles.placeBetText}>
                    Place Bet — ₹{betAmount} on {selectedBet || '...'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    betSection: { gap: 12 },
    sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    betOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    betCard: {
        flex: 1, backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14,
        alignItems: 'center', borderWidth: 1, gap: 4,
    },
    betEmoji: { fontSize: 28 },
    betLabel: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    betOdds: { fontSize: 14, fontWeight: 'bold' },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    amountInput: {
        flex: 1, backgroundColor: '#1A1A2E', borderRadius: 10, padding: 12,
        color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#2D2D44',
    },
    quickBtn: { backgroundColor: '#2D2D44', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
    quickBtnText: { color: '#8B5CF6', fontSize: 13, fontWeight: '600' },
    placeBetBtn: {
        backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 16,
        alignItems: 'center',
    },
    disabledBtn: { opacity: 0.5 },
    placeBetText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
