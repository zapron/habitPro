import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { quotes } from '../data/quotes';
import { Quote } from 'lucide-react-native';

export function QuoteCard() {
    const { theme } = useTheme();
    const [quote, setQuote] = useState('');

    useEffect(() => {
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        setQuote(randomQuote);
    }, []);

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
                <Text style={[styles.text, { color: theme.colors.textPrimary }]}>"{quote}"</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    iconContainer: {
        marginRight: 16,
        paddingTop: 4,
    },
    content: {
        flex: 1,
    },
    label: {
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    text: {
        fontSize: 16,
        lineHeight: 24,
        fontStyle: 'italic',
        fontWeight: '500',
    },
});
