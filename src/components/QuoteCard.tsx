import { Text } from "./AppText";
import {
  useMemo } from 'react';
import { View,
  StyleSheet,
} from "react-native";
import { useTheme } from '../context/ThemeContext';
import { quotes } from '../data/quotes';
import { Quote } from 'lucide-react-native';

export function QuoteCard() {
    const { theme } = useTheme();
    const quote = useMemo(() => quotes[Math.floor(Math.random() * quotes.length)], []);

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.lg,
                    borderColor: theme.colors.border,
                    ...theme.shadow.card,
                },
            ]}
        >
            <View style={styles.iconContainer}>
                <Quote size={20} color={theme.colors.indigo[400]} fill={theme.colors.indigo[400]} />
            </View>
            <View style={styles.content}>
                <Text style={[styles.label, { color: theme.colors.textMuted }]}>DAILY WISDOM</Text>
                <Text style={[styles.text, { color: theme.colors.textPrimary }]} numberOfLines={2}>"{quote}"</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        marginBottom: 10,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    iconContainer: {
        marginRight: 12,
        paddingTop: 3,
    },
    content: {
        flex: 1,
    },
    label: {
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1.2,
        marginBottom: 5,
        textTransform: 'uppercase',
    },
    text: {
        fontSize: 15,
        lineHeight: 21,
        fontStyle: 'italic',
        fontWeight: '600',
    },
});
