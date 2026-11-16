import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  Video,
  Circle,
  Pause,
  Play,
  Square,
  MonitorPlay,
  AlertTriangle,
} from "lucide-react-native";
import { useConnectionStore } from "../store/useConnectionStore";
import { CoreApiClient } from "../services/api";

type BusyAction = "open" | "record" | "pause" | "stop" | null;

export const ObsControlCard: React.FC = () => {
  const { pcIp, pcPort, authToken, obsStatus, setObsStatus } = useConnectionStore();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const state = obsStatus?.state || "offline";
  const isRunning = Boolean(obsStatus?.running);
  const isRecording = Boolean(obsStatus?.recording);
  const isPaused = Boolean(obsStatus?.paused);
  const wsConnected = Boolean(obsStatus?.ws_connected);

  const getBadgeConfig = () => {
    switch (state) {
      case "recording":
        return {
          label: `REC ${obsStatus?.duration_text || "00:00"}`,
          color: "#EF4444",
          bg: "rgba(239, 68, 68, 0.14)",
          border: "#EF4444",
        };
      case "paused":
        return {
          label: `PAUSED ${obsStatus?.duration_text || "00:00"}`,
          color: "#F59E0B",
          bg: "rgba(245, 158, 11, 0.14)",
          border: "#F59E0B",
        };
      case "standby":
        return {
          label: "STANDBY",
          color: "#10B981",
          bg: "rgba(16, 185, 129, 0.12)",
          border: "#10B981",
        };
      case "ws_disabled":
        return {
          label: "WS DISABLED",
          color: "#F59E0B",
          bg: "rgba(245, 158, 11, 0.14)",
          border: "#F59E0B",
        };
      case "auth_failed":
        return {
          label: "WS AUTH ERR",
          color: "#EF4444",
          bg: "rgba(239, 68, 68, 0.14)",
          border: "#EF4444",
        };
      case "connecting":
        return {
          label: "CONNECTING",
          color: "#06B6D4",
          bg: "rgba(6, 182, 212, 0.12)",
          border: "#06B6D4",
        };
      case "offline":
      default:
        return {
          label: "OBS OFFLINE",
          color: "#64748B",
          bg: "#121212",
          border: "#2A2A2A",
        };
    }
  };

  const badge = getBadgeConfig();

  const runAction = async (
    action: BusyAction,
    fn: () => Promise<any>,
    successMsg?: string
  ) => {
    if (!pcIp || !authToken || busyAction) return;
    setBusyAction(action);
    setFeedback(null);
    try {
      const nextStatus = await fn();
      setObsStatus(nextStatus);
      if (successMsg) {
        setFeedback(successMsg);
      }
    } catch (err: any) {
      setFeedback(`ERR // ${err?.message || "OBS request failed"}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenObs = () => {
    runAction(
      "open",
      () => CoreApiClient.openObs(pcIp, pcPort, authToken, false),
      isRunning ? "OBS STATUS REFRESHED" : "OBS STUDIO LAUNCHED ON PC"
    );
  };

  const handleRecordOrResume = () => {
    if (isRecording && isPaused) {
      runAction(
        "record",
        () => CoreApiClient.resumeObsRecording(pcIp, pcPort, authToken),
        "RECORDING RESUMED"
      );
      return;
    }
    runAction(
      "record",
      () => CoreApiClient.startObsRecording(pcIp, pcPort, authToken),
      isRunning ? "RECORDING STARTED" : "LAUNCHED OBS & STARTED RECORDING"
    );
  };

  const handlePause = () => {
    runAction(
      "pause",
      () => CoreApiClient.pauseObsRecording(pcIp, pcPort, authToken),
      "RECORDING PAUSED"
    );
  };

  const handleStop = () => {
    runAction(
      "stop",
      () => CoreApiClient.stopObsRecording(pcIp, pcPort, authToken),
      "RECORDING STOPPED & SAVED"
    );
  };

  const mbWritten =
    obsStatus && obsStatus.bytes > 0
      ? `${(obsStatus.bytes / (1024 * 1024)).toFixed(1)} MB`
      : null;

  const canPause = isRecording && !isPaused && wsConnected;
  const canStop = isRecording && wsConnected;
  const recordDisabled =
    Boolean(busyAction) ||
    (isRecording && !isPaused) ||
    (isRunning && !wsConnected && state === "ws_disabled");

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Video size={14} color="#06B6D4" />
          <Text style={styles.headerTitle}>OBS STUDIO // RECORDER</Text>
        </View>

        <View
          style={[
            styles.statusPill,
            { backgroundColor: badge.bg, borderColor: badge.border },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: badge.color }]} />
          <Text style={[styles.statusText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Diagnostic / Live Telemetry Line */}
        {state === "ws_disabled" ? (
          <View style={styles.warnBox}>
            <AlertTriangle size={13} color="#F59E0B" />
            <Text style={styles.warnText}>
              OBS is running without WebSocket enabled. Enable Tools → WebSocket
              Server Settings in OBS (or close OBS &amp; tap Open OBS).
            </Text>
          </View>
        ) : (
          <View style={styles.metaRow}>
            <Text style={styles.metaText} numberOfLines={1}>
              {isRecording
                ? isPaused
                  ? `Paused at ${obsStatus?.duration_text || "00:00"}${mbWritten ? ` • ${mbWritten}` : ""}`
                  : `Recording live • ${obsStatus?.duration_text || "00:00"}${mbWritten ? ` • ${mbWritten}` : ""}`
                : isRunning
                ? `OBS running (PID ${obsStatus?.pid || "---"}) • Ready to record`
                : obsStatus?.installed === false
                ? "OBS executable not found on PC"
                : "OBS closed • Tap Open OBS or Record to start"}
            </Text>
          </View>
        )}

        {obsStatus?.last_output_path ? (
          <Text style={styles.savedPath} numberOfLines={1}>
            LAST FILE: {obsStatus.last_output_path}
          </Text>
        ) : null}

        {(feedback || obsStatus?.error) && state !== "ws_disabled" ? (
          <Text
            style={[
              styles.feedbackText,
              (feedback?.startsWith("ERR") || obsStatus?.error) && {
                color: "#FCA5A5",
              },
            ]}
            numberOfLines={2}
          >
            {feedback || obsStatus?.error}
          </Text>
        ) : null}

        {/* 4 Tactile OBS Control Buttons */}
        <View style={styles.controlsGrid}>
          {/* OPEN OBS */}
          <TouchableOpacity
            style={[
              styles.btn,
              styles.openBtn,
              isRunning && styles.openBtnActive,
            ]}
            activeOpacity={0.8}
            disabled={Boolean(busyAction)}
            onPress={handleOpenObs}
          >
            {busyAction === "open" ? (
              <ActivityIndicator size="small" color="#06B6D4" />
            ) : (
              <MonitorPlay size={14} color={isRunning ? "#10B981" : "#06B6D4"} />
            )}
            <Text
              style={[
                styles.btnText,
                { color: isRunning ? "#10B981" : "#E2E8F0" },
              ]}
            >
              {isRunning ? "OBS OPEN" : "OPEN OBS"}
            </Text>
          </TouchableOpacity>

          {/* RECORD / RESUME */}
          <TouchableOpacity
            style={[
              styles.btn,
              isPaused ? styles.resumeBtn : styles.recBtn,
              recordDisabled && styles.btnDisabled,
            ]}
            activeOpacity={0.8}
            disabled={recordDisabled}
            onPress={handleRecordOrResume}
          >
            {busyAction === "record" ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : isPaused ? (
              <Play size={14} color="#090D16" fill="#090D16" />
            ) : (
              <Circle size={13} color="#FFF" fill="#EF4444" />
            )}
            <Text
              style={[
                styles.btnText,
                isPaused ? { color: "#090D16" } : { color: "#FCA5A5" },
              ]}
            >
              {isPaused ? "RESUME" : isRecording ? "REC LIVE" : "RECORD"}
            </Text>
          </TouchableOpacity>

          {/* PAUSE */}
          <TouchableOpacity
            style={[
              styles.btn,
              styles.pauseBtn,
              (!canPause || Boolean(busyAction)) && styles.btnDisabled,
            ]}
            activeOpacity={0.8}
            disabled={!canPause || Boolean(busyAction)}
            onPress={handlePause}
          >
            {busyAction === "pause" ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <Pause size={14} color="#F59E0B" />
            )}
            <Text style={[styles.btnText, { color: "#F59E0B" }]}>PAUSE</Text>
          </TouchableOpacity>

          {/* STOP */}
          <TouchableOpacity
            style={[
              styles.btn,
              styles.stopBtn,
              (!canStop || Boolean(busyAction)) && styles.btnDisabled,
            ]}
            activeOpacity={0.8}
            disabled={!canStop || Boolean(busyAction)}
            onPress={handleStop}
          >
            {busyAction === "stop" ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Square size={13} color="#EF4444" fill="#EF4444" />
            )}
            <Text style={[styles.btnText, { color: "#EF4444" }]}>STOP</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    marginBottom: 16,
  },
  header: {
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9.5,
    fontFamily: "monospace",
    fontWeight: "900",
  },
  body: {
    padding: 12,
    gap: 10,
  },
  metaRow: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaText: {
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: "monospace",
  },
  warnBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2B1E08",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 2,
    padding: 8,
  },
  warnText: {
    flex: 1,
    color: "#FDE68A",
    fontSize: 10.5,
    fontFamily: "monospace",
    lineHeight: 15,
  },
  savedPath: {
    color: "#10B981",
    fontSize: 10,
    fontFamily: "monospace",
  },
  feedbackText: {
    color: "#06B6D4",
    fontSize: 10.5,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  controlsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  btn: {
    width: "48.6%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 2,
    borderWidth: 1,
  },
  openBtn: {
    backgroundColor: "#141414",
    borderColor: "#334155",
  },
  openBtnActive: {
    backgroundColor: "#0D1E19",
    borderColor: "#10B981",
  },
  recBtn: {
    backgroundColor: "#2D1214",
    borderColor: "#EF4444",
  },
  resumeBtn: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  pauseBtn: {
    backgroundColor: "#261B0A",
    borderColor: "#F59E0B",
  },
  stopBtn: {
    backgroundColor: "#231212",
    borderColor: "#991B1B",
  },
  btnDisabled: {
    opacity: 0.38,
  },
  btnText: {
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
