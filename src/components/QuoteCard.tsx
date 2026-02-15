import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../styles/theme';
import { quotes } from '../data/quotes';
import { Quote } from 'lucide-react-native';

export function QuoteCard() {
    const [quote, setQuote] = useState('');

    useEffect(() => {
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        setQuote(randomQuote);
    }, []);

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <Quote size={20} color={theme.colors.indigo[400]} fill={theme.colors.indigo[400]} />
            </View>
            <View style={styles.content}>
                <Text style={styles.label}>DAILY WISDOM</Text>
                <Text style={styles.text}>"{quote}"</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.surface,
        padding: 20,
        borderRadius: theme.radius.lg,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'flex-start',
        ...theme.shadow.card,
    },
    iconContainer: {
        marginRight: 16,
        paddingTop: 4,
    },
    content: {
        flex: 1,
    },
    label: {
        color: theme.colors.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    text: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 24,
        fontStyle: 'italic',
        fontWeight: '500',
    },
});
