import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface ActionRowProps {
  icon: string;
  title: string;
  subtitle: string;
  points: number;
  buttonLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

export function ActionRow({ icon, title, subtitle, points, buttonLabel, onPress, disabled }: ActionRowProps) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.points}>+{points} pts</Text>
      </View>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 12,
  },
  rowDisabled: { opacity: 0.45 },
  icon: { fontSize: 30, marginRight: 14 },
  textCol: { flex: 1 },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: '#999999', fontSize: 13, marginTop: 4 },
  points: { color: '#ffffff', fontSize: 13, fontWeight: '800', marginTop: 6, letterSpacing: 1 },
  button: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonDisabled: { backgroundColor: '#555555' },
  buttonText: { color: '#000000', fontSize: 13, fontWeight: '800' },
});
