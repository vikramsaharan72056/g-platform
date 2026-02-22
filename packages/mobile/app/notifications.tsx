import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { notificationApi } from '../src/services/api';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
}

export default function NotificationsScreen() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async (pageNum = 1) => {
        try {
            const res = await notificationApi.getAll(pageNum);
            const data = res.data;
            if (pageNum === 1) {
                setNotifications(data.data || []);
            } else {
                setNotifications(prev => [...prev, ...(data.data || [])]);
            }
            setUnreadCount(data.unreadCount || 0);
            setHasMore(pageNum < (data.totalPages || 1));
            setPage(pageNum);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        fetchNotifications(1);
    }, []);

    const handleLoadMore = () => {
        if (hasMore && !loading) {
            fetchNotifications(page + 1);
        }
    };

    const handleMarkRead = async (id: string) => {
        try {
            await notificationApi.markRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error(err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationApi.markAllRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error(err);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'deposit': return '💰';
            case 'withdrawal': return '🏧';
            case 'game': return '🎮';
            case 'bonus': return '🎁';
            case 'security': return '🔐';
            default: return '🔔';
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    const renderItem = ({ item }: { item: Notification }) => (
        <TouchableOpacity
            style={[styles.notifCard, !item.isRead && styles.unread]}
            onPress={() => handleMarkRead(item.id)}
            activeOpacity={0.7}
        >
            <View style={styles.iconWrap}>
                <Text style={styles.icon}>{getIcon(item.type)}</Text>
            </View>
            <View style={styles.content}>
                <Text style={styles.notifTitle}>{item.title}</Text>
                <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            </View>
            {!item.isRead && <View style={styles.dot} />}
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>Notifications</Text>
                    {unreadCount > 0 && (
                        <TouchableOpacity onPress={handleMarkAllRead}>
                            <Text style={styles.markAllBtn}>Mark all read</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {unreadCount > 0 && (
                    <Text style={styles.subtitle}>{unreadCount} unread</Text>
                )}
            </View>

            <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7C5CFC" />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>🔔</Text>
                            <Text style={styles.emptyText}>No notifications yet</Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0E17' },
    header: { padding: 20, paddingTop: 60, paddingBottom: 8 },
    backBtn: { color: '#7C5CFC', fontSize: 16, marginBottom: 12 },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: { color: '#fff', fontSize: 24, fontWeight: '800' },
    subtitle: { color: '#8E95A9', fontSize: 13, marginTop: 4 },
    markAllBtn: { color: '#7C5CFC', fontSize: 14, fontWeight: '600' },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
    notifCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#141824',
        borderRadius: 14,
        padding: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#1E2236',
    },
    unread: {
        borderColor: 'rgba(124, 92, 252, 0.3)',
        backgroundColor: '#161B2E',
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#0D1117',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    icon: { fontSize: 18 },
    content: { flex: 1 },
    notifTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
    notifBody: { color: '#8E95A9', fontSize: 13, lineHeight: 18, marginBottom: 4 },
    time: { color: '#5A6072', fontSize: 12 },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#7C5CFC',
        marginTop: 6,
        marginLeft: 8,
    },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { color: '#5A6072', fontSize: 16 },
});
