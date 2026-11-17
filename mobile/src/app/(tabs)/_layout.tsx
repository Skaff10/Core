import React, { useEffect, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import * as Notifications from "expo-notifications";
import { CheckCircle2, AlertCircle } from "lucide-react-native";
import { useForegroundWebSocket, LaunchNotificationEvent } from "../../services/ws";
import { agentSocket } from "../../services/agentSocket";
import { useConnectionStore } from "../../store/useConnectionStore";
import { registerSixHourCameraSync } from "../../services/syncTask";
import { onIncomingFileReceived, ReceivedFileResult } from "../../services/fileReceiver";
import { GlassBackdrop } from "../../components/glassyui/glass-backdrop";
import {
  GlassToast,
  GlassToastClose,
  GlassToastDescription,
  GlassToastTitle,
  GlassToastViewport,
} from "../../components/glassyui/glass-toast";
import { AmbientBackdrop } from "../../components/ui/AppScreenShell";
import { FloatingGlassTabBar } from "../../components/navigation/FloatingGlassTabBar";
import { CORE_COLORS } from "../../theme/tokens";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function TabLayout() {
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const [transferBanner, setTransferBanner] = useState<ReceivedFileResult | null>(null);

  useEffect(() => {
    if (pcIp && authToken) {
      agentSocket.init(pcIp, pcPort, authToken);
    }
  }, [pcIp, pcPort, authToken]);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
    registerSixHourCameraSync().catch(() => {});

    const unsubscribe = onIncomingFileReceived((result) => {
      setTransferBanner(result);

      Notifications.scheduleNotificationAsync({
        content: {
          title: result.ok ? "File Received from PC" : "File Transfer Failed",
          body: result.ok
            ? `${result.filename} -> Saved to ${result.destination}`
            : `Failed to receive ${result.filename}: ${result.error}`,
        },
        trigger: null,
      }).catch(() => {});
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLaunchNotification = useCallback(async (event: LaunchNotificationEvent) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title || "PC App Launched",
          body: event.body || "Command executed on Core PC.",
        },
        trigger: null,
      });
    } catch {
      // Fallback if running in environments without native push capability
    }
  }, []);

  // Maintain persistent WebSocket link to PC Foreground Monitor & Launch Notifications
  useForegroundWebSocket(handleLaunchNotification);

  return (
    <GlassBackdrop backdrop={<AmbientBackdrop />} style={styles.root}>
      <GlassToastViewport />

      {transferBanner && (
        <GlassToast
          open={Boolean(transferBanner)}
          onOpenChange={(open) => {
            if (!open) setTransferBanner(null);
          }}
          duration={5000}
        >
          <View style={styles.toastRow}>
            {transferBanner.ok ? (
              <CheckCircle2 size={20} color={CORE_COLORS.emerald} />
            ) : (
              <AlertCircle size={20} color={CORE_COLORS.coral} />
            )}
            <View style={styles.toastBody}>
              <GlassToastTitle>
                {transferBanner.ok ? "Received from PC" : "Transfer Error"}
              </GlassToastTitle>
              <GlassToastDescription>
                {transferBanner.ok
                  ? `${transferBanner.filename} → ${transferBanner.destination}`
                  : `${transferBanner.filename}: ${transferBanner.error}`}
              </GlassToastDescription>
            </View>
          </View>
          <GlassToastClose />
        </GlassToast>
      )}

      <Tabs
        tabBar={(props) => <FloatingGlassTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "transparent" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="chat" options={{ title: "Chat" }} />
        <Tabs.Screen name="files" options={{ title: "Files" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    </GlassBackdrop>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CORE_COLORS.bgBase,
  },
  toastRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  toastBody: {
    flex: 1,
  },
});
