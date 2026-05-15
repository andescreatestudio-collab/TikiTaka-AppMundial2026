import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function GroupSelectionScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>OPCIONES DE GRUPO</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.options}>
        <TouchableOpacity 
          style={styles.optionCard} 
          onPress={() => router.push('/groups/create')}
        >
          <Ionicons name="add-circle-outline" size={40} color="#00FF41" />
          <Text style={styles.optionTitle}>CREAR GRUPO</Text>
          <Text style={styles.optionDesc}>Crea tu propia liga y compite con amigos</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.optionCard} 
          onPress={() => router.push('/groups/join')}
        >
          <Ionicons name="people-outline" size={40} color="#00FF41" />
          <Text style={styles.optionTitle}>UNIRSE A GRUPO</Text>
          <Text style={styles.optionDesc}>Usa un código de invitación para entrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131313', padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  title: { color: '#00FF41', fontSize: 20, fontWeight: '900' },
  options: { gap: 20 },
  optionCard: {
    backgroundColor: '#201f1f',
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b4b37',
    alignItems: 'center',
  },
  optionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  optionDesc: { color: '#b9ccb2', fontSize: 14, textAlign: 'center' },
});
