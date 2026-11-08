import React, { useEffect, useState, useCallback } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderStatus } from "../../components/HeaderStatus";
import { ForegroundCard } from "../../components/ForegroundCard";
import { ActionGrid } from "../../components/ActionGrid";
import { useConnectionStore } from "../../store/useConnectionStore";
import { CoreApiClient } from "../../services/api";

export default function HomeScreen() {
  const { pcIp, pcPort, authToken, setQuickActions, setTelemetry, setConnectedState } =
    useConnectionStore();
  const [refreshing, setRefreshing] = useState(false);

  const syncDashboard = useCallback(async () => {
    if (!pcIp || !authToken) return;
    setRefreshing(true);
    try {
      const [pingData, actions] = await Promise.all([
        CoreApiClient.ping(pcIp, pcPort, authToken),
        CoreApiClient.fetchQuickActions(pcIp, pcPort, authToken),
      ]);
      setConnectedState(true, null);
      if (pingData.telemetry) {
        setTelemetry(pingData.telemetry);
      }
      setQuickActions(actions);
    } catch (err: any) {
      setConnectedState(false, err?.message || "Failed reaching PC backend");
    } finally {
      setRefreshing(false);
    }
  }, [pcIp, pcPort, authToken, setQuickActions, setTelemetry, setConnectedState]);

  useEffect(() => {
    syncDashboard();
  }, [syncDashboard]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="SYSTEM COMMAND DECK" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ForegroundCard />
        <ActionGrid onRefresh={syncDashboard} refreshing={refreshing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});

