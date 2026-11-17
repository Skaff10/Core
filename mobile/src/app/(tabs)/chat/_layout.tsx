import React from "react";
import { Stack } from "expo-router";
import { CORE_COLORS } from "../../../theme/tokens";

export default function ChatStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: CORE_COLORS.bgBase },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ contentStyle: { backgroundColor: "transparent" } }}
      />
      <Stack.Screen name="[projectId]" />
      <Stack.Screen name="session/[sessionId]" />
    </Stack>
  );
}
