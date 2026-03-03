import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
    withTiming
} from 'react-native-reanimated';

interface AnimatedCardProps {
    suit: string;
    value: string;
    index: number;
    delay?: number;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({ suit, value, index, delay = 100 }) => {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(-100);
    const rotation = useSharedValue(15);

    useEffect(() => {
        opacity.value = withDelay(index * delay, withTiming(1, { duration: 300 }));
        translateY.value = withDelay(index * delay, withSpring(0));
        rotation.value = withDelay(index * delay, withSpring(0));
    }, [suit, value]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [
                { translateY: translateY.value },
                { rotate: `${rotation.value}deg` }
            ]
        };
    });

    const isRed = suit === 'H' || suit === 'D' || suit === '❤️' || suit === '♦️';
    const suitSymbol = suit.length > 1 ? suit : (suit === 'H' ? '❤️' : suit === 'D' ? '♦️' : suit === 'S' ? '♠️' : '♣️');

    return (
        <Animated.View style={[styles.card, animatedStyle]}>
            <View style={styles.cardHeader}>
                <Text style={[styles.cardValue, isRed && styles.red]}>{value}</Text>
                <Text style={[styles.cardSuitSmall, isRed && styles.red]}>{suitSymbol}</Text>
            </View>
            <View style={styles.cardBody}>
                <Text style={[styles.cardSuitLarge, isRed && styles.red]}>{suitSymbol}</Text>
            </View>
            <View style={styles.cardFooter}>
                <Text style={[styles.cardSuitSmall, isRed && styles.red]}>{suitSymbol}</Text>
                <Text style={[styles.cardValue, isRed && styles.red]}>{value}</Text>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    card: {
        width: 70,
        height: 100,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 6,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 5,
        marginHorizontal: 4,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', transform: [{ rotate: '180deg' }] },
    cardValue: { fontSize: 14, fontWeight: 'bold', color: '#1A1A2E' },
    cardSuitSmall: { fontSize: 12 },
    cardBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    cardSuitLarge: { fontSize: 32 },
    red: { color: '#EF4444' },
});
