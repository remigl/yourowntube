import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '../src/components/States';
import { AppProvider, useApp } from '../src/state/AppContext';
import { colors, space, type } from '../src/theme';

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.border },
};

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
    // L'application est en portrait ; seul le lecteur plein écran passe en paysage.
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <AppProvider>
          <StatusBar style="light" />
          <Gate />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Attend l'ouverture de la base locale avant d'afficher l'application. */
function Gate() {
  const { ready, initError, retryInit } = useApp();

  if (initError) {
    return (
      <View style={styles.center}>
        <Text style={type.h2}>Stockage local indisponible</Text>
        <Text style={[type.meta, styles.msg]}>{initError}</Text>
        <Button label="Réessayer" icon="refresh" onPress={retryInit} />
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade_from_bottom',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="watch/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
      <Stack.Screen name="history" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="library" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: space.xl, gap: space.md },
  msg: { textAlign: 'center' },
});
