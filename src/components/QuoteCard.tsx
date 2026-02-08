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
        backgroundColor: theme.colors.slate[800],
        padding: 20,
        borderRadius: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: theme.colors.slate[700],
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
        color: theme.colors.slate[500],
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    text: {
        color: theme.colors.slate[200],
        fontSize: 16,
        lineHeight: 24,
        fontStyle: 'italic',
        fontWeight: '500',
    },
});
