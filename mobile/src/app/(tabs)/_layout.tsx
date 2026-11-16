import React, { useEffect, useCallback, useState } from "react";
import { View, Text } from "react-native";
import { Tabs } from "expo-router";
import * as Notifications from "expo-notifications";
import { Terminal, MessageSquareCode, FolderTree, Sliders, CheckCircle2, AlertCircle } from "lucide-react-native";
import { useForegroundWebSocket, LaunchNotificationEvent } from "../../services/ws";
import { agentSocket } from "../../services/agentSocket";
import { useConnectionStore } from "../../store/useConnectionStore";
import { registerSixHourCameraSync } from "../../services/syncTask";
import { onIncomingFileReceived, ReceivedFileResult } from "../../services/fileReceiver";

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
      setTimeout(() => setTransferBanner(null), 5000);

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
    <View style={{ flex: 1 }}>
      {transferBanner && (
        <View
          style={{
            position: "absolute",
            top: 40,
            left: 16,
            right: 16,
            zIndex: 9999,
            backgroundColor: transferBanner.ok ? "rgba(6, 78, 59, 0.95)" : "rgba(127, 29, 29, 0.95)",
            borderColor: transferBanner.ok ? "#10B981" : "#EF4444",
            borderWidth: 1,
            borderRadius: 8,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {transferBanner.ok ? (
            <CheckCircle2 size={20} color="#10B981" style={{ marginRight: 8 }} />
          ) : (
            <AlertCircle size={20} color="#EF4444" style={{ marginRight: 8 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13, fontFamily: "monospace" }}>
              {transferBanner.ok ? "RECEIVED FROM PC" : "TRANSFER ERROR"}
            </Text>
            <Text style={{ color: "#E2E8F0", fontSize: 12, marginTop: 2 }}>
              {transferBanner.ok
                ? `${transferBanner.filename} -> ${transferBanner.destination}`
                : `${transferBanner.filename}: ${transferBanner.error}`}
            </Text>
          </View>
        </View>
      )}
      <Tabs
        screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#161616",
          borderTopWidth: 1,
          borderTopColor: "#2A2A2A",
          height: 60,
          paddingTop: 6,
          paddingBottom: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: "#06B6D4",
        tabBarInactiveTintColor: "#64748B",
        tabBarLabelStyle: {
          fontFamily: "monospace",
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "HOME",
          tabBarIcon: ({ color }) => <Terminal size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "CHAT",
          tabBarIcon: ({ color }) => <MessageSquareCode size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: "FILES",
          tabBarIcon: ({ color }) => <FolderTree size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "SETTINGS",
          tabBarIcon: ({ color }) => <Sliders size={18} color={color} />,
        }}
      />
    </Tabs>
  </View>
  );
}
