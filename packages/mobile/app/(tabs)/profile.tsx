import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/stores/authStore';
import { useWalletStore } from '../../src/stores/walletStore';

export default function ProfileScreen() {
    const { user, logout } = useAuthStore();
    const { balance, bonusBalance, fetchBalance } = useWalletStore();

    useEffect(() => {
        fetchBalance();
    }, []);

    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: logout },
        ]);
    };

    const MenuItem = ({ icon, label, value, onPress }: { icon: string; label: string; value?: string; onPress?: () => void }) => (
        <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
            <View style={styles.menuLeft}>
                <View style={styles.menuIcon}>
                    <FontAwesome name={icon as any} size={16} color="#A29BFE" />
                </View>
                <Text style={styles.menuLabel}>{label}</Text>
            </View>
            {value ? (
                <Text style={styles.menuValue}>{value}</Text>
            ) : (
                <FontAwesome name="chevron-right" size={12} color="#6B7280" />
            )}
        </TouchableOpacity>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Profile Card */}
            <LinearGradient
                colors={['#1E1E3A', '#2A2A4A']}
                style={styles.profileCard}
            >
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                </View>
                <Text style={styles.userName}>{user?.displayName || 'Player'}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
                <View style={styles.balanceRow}>
                    <View style={styles.balanceBox}>
                        <Text style={styles.balanceLabel}>Balance</Text>
                        <Text style={styles.balanceValue}>₹{balance.toFixed(2)}</Text>
                    </View>
                    <View style={styles.balanceDivider} />
                    <View style={styles.balanceBox}>
                        <Text style={styles.balanceLabel}>Bonus</Text>
                        <Text style={styles.balanceValue}>₹{bonusBalance.toFixed(2)}</Text>
                    </View>
                </View>
            </LinearGradient>

            {/* Menu Sections */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.menuGroup}>
                    <MenuItem icon="user" label="Display Name" value={user?.displayName} />
                    <MenuItem icon="envelope" label="Email" value={user?.email} />
                    <MenuItem icon="phone" label="Phone" value={user?.phone || 'Not set'} />
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Security</Text>
                <View style={styles.menuGroup}>
                    <MenuItem icon="lock" label="Change Password" onPress={() => { }} />
                    <MenuItem
                        icon="shield"
                        label="Two-Factor Auth"
                        value={user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    />
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Support</Text>
                <View style={styles.menuGroup}>
                    <MenuItem icon="question-circle" label="Help & FAQ" onPress={() => { }} />
                    <MenuItem icon="file-text" label="Terms of Service" onPress={() => { }} />
                </View>
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <FontAwesome name="sign-out" size={16} color="#F87171" />
                <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>

            <Text style={styles.version}>ABCRummy v1.0.0</Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F23' },
    profileCard: {
        margin: 16,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(162,155,254,0.15)',
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#6C5CE7',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarText: { fontSize: 28, fontWeight: '800', color: '#FFF' },
    userName: { fontSize: 22, fontWeight: '700', color: '#F1F5F9' },
    userEmail: { fontSize: 14, color: '#94A3B8', marginTop: 2 },
    balanceRow: { flexDirection: 'row', marginTop: 20, width: '100%' },
    balanceBox: { flex: 1, alignItems: 'center' },
    balanceDivider: { width: 1, backgroundColor: '#2D2D44' },
    balanceLabel: { color: '#6B7280', fontSize: 12 },
    balanceValue: { color: '#A29BFE', fontSize: 20, fontWeight: '700', marginTop: 4 },
    section: { marginHorizontal: 16, marginTop: 20 },
    sectionTitle: { color: '#6B7280', fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
    menuGroup: {
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2D2D44',
    },
    menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(162,155,254,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuLabel: { color: '#F1F5F9', fontSize: 15 },
    menuValue: { color: '#94A3B8', fontSize: 14 },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 28,
        marginHorizontal: 16,
        backgroundColor: 'rgba(248,113,113,0.1)',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(248,113,113,0.2)',
    },
    logoutText: { color: '#F87171', fontSize: 16, fontWeight: '700' },
    version: { color: '#4B5563', fontSize: 12, textAlign: 'center', marginTop: 16 },
});
