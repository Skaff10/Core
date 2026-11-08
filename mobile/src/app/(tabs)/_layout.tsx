import React, { useEffect, useCallback } from "react";
import { Tabs } from "expo-router";
import * as Notifications from "expo-notifications";
import { Terminal, MessageSquareCode, FolderTree, Sliders } from "lucide-react-native";
import { useForegroundWebSocket, LaunchNotificationEvent } from "../../services/ws";
import { registerSixHourCameraSync } from "../../services/syncTask";

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
  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
    registerSixHourCameraSync().catch(() => {});
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
  );
}
