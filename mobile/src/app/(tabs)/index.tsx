import React, { useEffect, useState, useCallback } from "react";
import { ScrollView, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderStatus } from "../../components/HeaderStatus";
import { ForegroundCard } from "../../components/ForegroundCard";
import { ObsControlCard } from "../../components/ObsControlCard";
import { ActionGrid } from "../../components/ActionGrid";
import { useConnectionStore } from "../../store/useConnectionStore";
import { CoreApiClient } from "../../services/api";
import { CORE_COLORS, CORE_SPACING } from "../../theme/tokens";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    pcIp,
    pcPort,
    authToken,
    setQuickActions,
    setTelemetry,
    setObsStatus,
    setConnectedState,
  } = useConnectionStore();
  const [refreshing, setRefreshing] = useState(false);

  const syncDashboard = useCallback(async () => {
    if (!pcIp || !authToken) return;
    setRefreshing(true);
    try {
      const [pingData, actions, obs] = await Promise.all([
        CoreApiClient.ping(pcIp, pcPort, authToken),
        CoreApiClient.fetchQuickActions(pcIp, pcPort, authToken),
        CoreApiClient.fetchObsStatus(pcIp, pcPort, authToken).catch(() => null),
      ]);
      setConnectedState(true, null);
      if (pingData.telemetry) {
        setTelemetry(pingData.telemetry);
      }
      if (obs) {
        setObsStatus(obs);
      }
      setQuickActions(actions);
    } catch (err: any) {
      setConnectedState(false, err?.message || "Failed reaching PC backend");
    } finally {
      setRefreshing(false);
    }
  }, [pcIp, pcPort, authToken, setQuickActions, setTelemetry, setObsStatus, setConnectedState]);

  useEffect(() => {
    syncDashboard();
  }, [syncDashboard]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="System Command Deck" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 12) + CORE_SPACING.floatingDockOffset },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={syncDashboard}
            tintColor={CORE_COLORS.cyan}
            colors={[CORE_COLORS.cyan]}
          />
        }
      >
        <ForegroundCard />
        <ObsControlCard />
        <ActionGrid onRefresh={syncDashboard} refreshing={refreshing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: CORE_SPACING.screenX,
    paddingTop: 4,
    gap: CORE_SPACING.sectionGap,
  },
});
