import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDashboardLayoutStore } from '@/stores/dashboardLayoutStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrate = useDashboardLayoutStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="add-food"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="goals"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="kitchen-mode"
            options={{
              presentation: 'fullScreenModal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="onboarding"
            options={{
              presentation: 'fullScreenModal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="barcode-demo"
            options={{
              presentation: 'modal',
              title: 'Barcode demo',
            }}
          />
          <Stack.Screen
            name="edit-entry"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="edit-dashboard"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="health-profile"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="goals-guided"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="goals-edit"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
