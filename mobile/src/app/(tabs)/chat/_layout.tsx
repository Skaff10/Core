import React from "react";
import { Stack } from "expo-router";

export default function ChatStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#121212" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[projectId]" />
      <Stack.Screen name="session/[sessionId]" />
    </Stack>
  );
}

