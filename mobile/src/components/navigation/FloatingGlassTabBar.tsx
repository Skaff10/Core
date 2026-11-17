import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Terminal,
  MessageSquareCode,
  FolderTree,
  Sliders,
} from "lucide-react-native";
import { GlassSurface } from "../glassyui/glass-surface";
import { useGlassTheme } from "../glassyui/glass-provider";
import { useAgentStore } from "../../store/agentStore";
import { CORE_COLORS, CORE_RADIUS, CORE_SHADOWS } from "../../theme/tokens";
import { CORE_MOTION } from "../../theme/motion";

type BottomTabBarProps = Parameters<
  Extract<React.ComponentProps<typeof Tabs>["tabBar"], (...args: any[]) => any>
>[0];

const TAB_META: Record<
  string,
  { label: string; renderIcon: (color: string, active: boolean) => React.ReactNode }
> = {
  index: {
    label: "Home",
    renderIcon: (color, active) => (
      <Terminal size={19} color={color} strokeWidth={active ? 2.2 : 1.75} />
    ),
  },
  chat: {
    label: "Chat",
    renderIcon: (color, active) => (
      <MessageSquareCode size={19} color={color} strokeWidth={active ? 2.2 : 1.75} />
    ),
  },
  files: {
    label: "Files",
    renderIcon: (color, active) => (
      <FolderTree size={19} color={color} strokeWidth={active ? 2.2 : 1.75} />
    ),
  },
  settings: {
    label: "Settings",
    renderIcon: (color, active) => (
      <Sliders size={19} color={color} strokeWidth={active ? 2.2 : 1.75} />
    ),
  },
};

export const FloatingGlassTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets: tabInsets,
}) => {
  const safeInsets = useSafeAreaInsets();
  const insets = tabInsets ?? safeInsets;
  const segments = useSegments();
  const { preferences } = useGlassTheme();
  const { projects } = useAgentStore();
  const nativeDriver = Platform.OS !== "web";

  // Hide floating dock when inside an active chat session thread so keyboard & composer breathe
  const inChatSession = (segments as string[]).includes("session");

  const hasPendingApproval = projects.some((p) => p.hasPendingPermission);
  const hasRunningTurn = projects.some((p) => p.hasRunningTurn);

  const [barWidth, setBarWidth] = useState(0);
  const tabCount = state.routes.length;
  const horizontalPad = 6;
  const innerWidth = Math.max(0, barWidth - horizontalPad * 2);
  const pillWidth = tabCount > 0 ? innerWidth / tabCount : 0;

  const activeOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = state.index * pillWidth;
    if (preferences.reduceMotion) {
      activeOffset.setValue(target);
      return;
    }
    Animated.spring(activeOffset, {
      toValue: target,
      useNativeDriver: nativeDriver,
      ...CORE_MOTION.springSnappy,
    }).start();
  }, [activeOffset, nativeDriver, pillWidth, preferences.reduceMotion, state.index]);

  if (inChatSession) {
    return null;
  }

  const handleLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  };

  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: bottomOffset }]}
    >
      <GlassSurface
        preset="overlay"
        elevation="raised"
        onLayout={handleLayout}
        style={[styles.dock, CORE_SHADOWS.dock]}
      >
        {/* Sliding active glass highlight pill */}
        {pillWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activePill,
              {
                width: pillWidth,
                transform: [{ translateX: activeOffset }],
              },
            ]}
          />
        )}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const meta = TAB_META[route.name] || {
            label: options.title || route.name,
            renderIcon: (color: string) => <Terminal size={19} color={color} />,
          };

          const showChatDot =
            route.name === "chat" && (hasPendingApproval || hasRunningTurn);
          const dotColor = hasPendingApproval
            ? CORE_COLORS.amberFill
            : CORE_COLORS.cyan;

          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync().catch(() => {});
              }
              navigateToTab(route.key);
            }
          };

          const onLongPress = () => {
            emitter.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          const tint = isFocused ? CORE_COLORS.cyan : CORE_COLORS.textSecondary;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || meta.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tabItem,
                pressed && !isFocused && styles.tabPressed,
              ]}
            >
              <View style={styles.iconWrap}>
                {meta.renderIcon(tint, isFocused)}
                {showChatDot && (
                  <View style={[styles.badgeDot, { backgroundColor: dotColor }]} />
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused
                      ? CORE_COLORS.textPrimary
                      : CORE_COLORS.textSecondary,
                    fontWeight: isFocused ? "700" : "500",
                  },
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 50,
  },
  dock: {
    width: "100%",
    maxWidth: 480,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 62,
  },
  activePill: {
    position: "absolute",
    left: 6,
    top: 6,
    bottom: 6,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(34, 211, 238, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(34, 211, 238, 0.28)",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    minHeight: 48,
    borderRadius: 22,
    gap: 3,
  },
  tabPressed: {
    opacity: 0.72,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: "#0B1019",
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
});
