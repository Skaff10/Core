import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { GlassProvider } from "../components/glassyui/glass-provider";
import { GlassToastProvider } from "../components/glassyui/glass-toast";
import { ConnectionProvider } from "../store/useConnectionStore";
import { CORE_COLORS } from "../theme/tokens";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CORE_COLORS.bgBase }}>
      <SafeAreaProvider>
        <GlassProvider defaultTheme="dark">
          <GlassToastProvider duration={5000}>
            <ConnectionProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: CORE_COLORS.bgBase },
                }}
              >
                <Stack.Screen name="(tabs)" />
              </Stack>
            </ConnectionProvider>
          </GlassToastProvider>
        </GlassProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
