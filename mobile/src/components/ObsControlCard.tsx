import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import {
  Video,
  Circle,
  Pause,
  Play,
  Square,
  MonitorPlay,
  FolderOutput,
} from "lucide-react-native";
import { useConnectionStore } from "../store/useConnectionStore";
import { CoreApiClient } from "../services/api";
import { useGlassTheme } from "./glassyui/glass-provider";
import { GlassBadge, type GlassBadgeTone } from "./glassyui/glass-badge";
import { GlassAlert } from "./glassyui/glass-alert";
import { CoreCard } from "./ui/CoreCard";
import { TactilePressable } from "./ui/TactilePressable";
import { CORE_COLORS, CORE_RADIUS } from "../theme/tokens";
import { CORE_TYPOGRAPHY } from "../theme/typography";

type BusyAction = "open" | "record" | "pause" | "stop" | null;

export const ObsControlCard: React.FC = () => {
  const { pcIp, pcPort, authToken, obsStatus, setObsStatus } = useConnectionStore();
  const { preferences } = useGlassTheme();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const recPulse = useRef(new Animated.Value(1)).current;
  const nativeDriver = Platform.OS !== "web";

  const state = obsStatus?.state || "offline";
  const isRunning = Boolean(obsStatus?.running);
  const isRecording = Boolean(obsStatus?.recording);
  const isPaused = Boolean(obsStatus?.paused);
  const wsConnected = Boolean(obsStatus?.ws_connected);

  useEffect(() => {
    if (!(isRecording && !isPaused) || preferences.reduceMotion) {
      recPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recPulse, {
          toValue: 0.35,
          duration: 850,
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(recPulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: nativeDriver,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPaused, isRecording, nativeDriver, preferences.reduceMotion, recPulse]);

  const getBadgeConfig = (): { label: string; tone: GlassBadgeTone } => {
    switch (state) {
      case "recording":
        return {
          label: `REC ${obsStatus?.duration_text || "00:00"}`,
          tone: "red",
        };
      case "paused":
        return {
          label: `Paused ${obsStatus?.duration_text || "00:00"}`,
          tone: "orange",
        };
      case "standby":
        return { label: "Standby", tone: "green" };
      case "ws_disabled":
        return { label: "WS Disabled", tone: "orange" };
      case "auth_failed":
        return { label: "WS Auth Error", tone: "red" };
      case "connecting":
        return { label: "Connecting", tone: "blue" };
      case "offline":
      default:
        return { label: "Offline", tone: "neutral" };
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
        setFeedback({ ok: true, text: successMsg });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || "OBS request failed" });
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenObs = () => {
    runAction(
      "open",
      () => CoreApiClient.openObs(pcIp, pcPort, authToken, false),
      isRunning ? "OBS status refreshed" : "OBS Studio launched on PC"
    );
  };

  const handleRecordOrResume = () => {
    if (isRecording && isPaused) {
      runAction(
        "record",
        () => CoreApiClient.resumeObsRecording(pcIp, pcPort, authToken),
        "Recording resumed"
      );
      return;
    }
    runAction(
      "record",
      () => CoreApiClient.startObsRecording(pcIp, pcPort, authToken),
      isRunning ? "Recording started" : "Launched OBS & started recording"
    );
  };

  const handlePause = () => {
    runAction(
      "pause",
      () => CoreApiClient.pauseObsRecording(pcIp, pcPort, authToken),
      "Recording paused"
    );
  };

  const handleStop = () => {
    runAction(
      "stop",
      () => CoreApiClient.stopObsRecording(pcIp, pcPort, authToken),
      "Recording stopped & saved"
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
    <CoreCard
      variant="panel"
      elevation="base"
      accentBorderColor={
        isRecording && !isPaused
          ? CORE_COLORS.coralBorder
          : isPaused
          ? CORE_COLORS.amberBorder
          : undefined
      }
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View
            style={[
              styles.iconWell,
              isRecording && !isPaused && styles.iconWellRec,
            ]}
          >
            <Video
              size={15}
              color={isRecording && !isPaused ? CORE_COLORS.coral : CORE_COLORS.cyan}
            />
          </View>
          <View>
            <Text style={styles.eyebrow}>OBS Studio</Text>
            <Text style={styles.subTitle}>Capture & Recorder</Text>
          </View>
        </View>

        <View style={styles.badgeWrap}>
          {isRecording && !isPaused && (
            <Animated.View
              style={[styles.liveRecDot, { opacity: recPulse }]}
            />
          )}
          <GlassBadge dot={!(isRecording && !isPaused)} tone={badge.tone}>
            {badge.label}
          </GlassBadge>
        </View>
      </View>

      {/* Status Well / Warning */}
      {state === "ws_disabled" ? (
        <GlassAlert tone="warning" title="WebSocket Disabled" style={styles.alertBox}>
          Enable Tools → WebSocket Server Settings in OBS, or close OBS and tap Open OBS.
        </GlassAlert>
      ) : (
        <View style={styles.statusWell}>
          <Text style={styles.statusText} numberOfLines={2}>
            {isRecording
              ? isPaused
                ? `Paused at ${obsStatus?.duration_text || "00:00"}${mbWritten ? ` · ${mbWritten}` : ""}`
                : `Recording live · ${obsStatus?.duration_text || "00:00"}${mbWritten ? ` · ${mbWritten}` : ""}`
              : isRunning
              ? `OBS running (PID ${obsStatus?.pid || "---"}) · Ready to record`
              : obsStatus?.installed === false
              ? "OBS executable not found on PC"
              : "OBS is closed · Tap Open OBS or Record to begin"}
          </Text>
        </View>
      )}

      {obsStatus?.last_output_path ? (
        <View style={styles.outputRow}>
          <FolderOutput size={13} color={CORE_COLORS.emerald} />
          <Text style={styles.outputPath} numberOfLines={1}>
            {obsStatus.last_output_path}
          </Text>
        </View>
      ) : null}

      {(feedback || obsStatus?.error) && state !== "ws_disabled" ? (
        <Text
          style={[
            styles.feedbackText,
            {
              color:
                feedback?.ok === false || obsStatus?.error
                  ? CORE_COLORS.coral
                  : CORE_COLORS.cyan,
            },
          ]}
          numberOfLines={2}
        >
          {feedback?.text || obsStatus?.error}
        </Text>
      ) : null}

      {/* 2x2 Tactile Controls */}
      <View style={styles.controlsGrid}>
        {/* OPEN OBS */}
        <View style={styles.btnSlot}>
          <TactilePressable
            haptic
            disabled={Boolean(busyAction)}
            onPress={handleOpenObs}
            accessibilityRole="button"
            accessibilityLabel={isRunning ? "OBS Open" : "Open OBS"}
            style={[
              styles.controlBtn,
              isRunning ? styles.btnEmerald : styles.btnNeutral,
            ]}
          >
            {busyAction === "open" ? (
              <ActivityIndicator size="small" color={CORE_COLORS.cyan} />
            ) : (
              <MonitorPlay
                size={16}
                color={isRunning ? CORE_COLORS.emerald : CORE_COLORS.cyan}
              />
            )}
            <Text
              style={[
                styles.controlLabel,
                { color: isRunning ? CORE_COLORS.emerald : CORE_COLORS.textPrimary },
              ]}
            >
              {isRunning ? "OBS Open" : "Open OBS"}
            </Text>
          </TactilePressable>
        </View>

        {/* RECORD / RESUME */}
        <View style={styles.btnSlot}>
          <TactilePressable
            haptic
            disabled={recordDisabled}
            onPress={handleRecordOrResume}
            accessibilityRole="button"
            accessibilityLabel={isPaused ? "Resume recording" : "Start recording"}
            style={[
              styles.controlBtn,
              isPaused ? styles.btnResume : styles.btnRecord,
            ]}
          >
            {busyAction === "record" ? (
              <ActivityIndicator
                size="small"
                color={isPaused ? CORE_COLORS.textInverse : "#FFFFFF"}
              />
            ) : isPaused ? (
              <Play size={15} color={CORE_COLORS.textInverse} fill={CORE_COLORS.textInverse} />
            ) : (
              <Circle size={13} color="#FFFFFF" fill={CORE_COLORS.coralFill} />
            )}
            <Text
              style={[
                styles.controlLabel,
                isPaused
                  ? { color: CORE_COLORS.textInverse, fontWeight: "700" }
                  : { color: "#FFE4E6" },
              ]}
            >
              {isPaused ? "Resume" : isRecording ? "Rec Live" : "Record"}
            </Text>
          </TactilePressable>
        </View>

        {/* PAUSE */}
        <View style={styles.btnSlot}>
          <TactilePressable
            haptic
            disabled={!canPause || Boolean(busyAction)}
            onPress={handlePause}
            accessibilityRole="button"
            accessibilityLabel="Pause recording"
            style={[styles.controlBtn, styles.btnPause]}
          >
            {busyAction === "pause" ? (
              <ActivityIndicator size="small" color={CORE_COLORS.amber} />
            ) : (
              <Pause size={15} color={CORE_COLORS.amber} />
            )}
            <Text style={[styles.controlLabel, { color: CORE_COLORS.amber }]}>
              Pause
            </Text>
          </TactilePressable>
        </View>

        {/* STOP */}
        <View style={styles.btnSlot}>
          <TactilePressable
            haptic
            disabled={!canStop || Boolean(busyAction)}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            style={[styles.controlBtn, styles.btnStop]}
          >
            {busyAction === "stop" ? (
              <ActivityIndicator size="small" color={CORE_COLORS.coral} />
            ) : (
              <Square size={14} color={CORE_COLORS.coral} fill={CORE_COLORS.coral} />
            )}
            <Text style={[styles.controlLabel, { color: CORE_COLORS.coral }]}>
              Stop
            </Text>
          </TactilePressable>
        </View>
      </View>
    </CoreCard>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: CORE_COLORS.cyanSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.cyanBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellRec: {
    backgroundColor: CORE_COLORS.coralSoft,
    borderColor: CORE_COLORS.coralBorder,
  },
  eyebrow: {
    ...CORE_TYPOGRAPHY.eyebrow,
    color: CORE_COLORS.textSecondary,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
    marginTop: 1,
  },
  badgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveRecDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  alertBox: {
    marginBottom: 12,
  },
  statusWell: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  statusText: {
    ...CORE_TYPOGRAPHY.mono,
    color: CORE_COLORS.textSecondary,
    lineHeight: 18,
  },
  outputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  outputPath: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.emerald,
    flex: 1,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  controlsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginTop: 4,
  },
  btnSlot: {
    width: "48.4%",
  },
  controlBtn: {
    minHeight: 48,
    borderRadius: CORE_RADIUS.md,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  btnNeutral: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: CORE_COLORS.borderDefault,
  },
  btnEmerald: {
    backgroundColor: CORE_COLORS.emeraldSoft,
    borderColor: CORE_COLORS.emeraldBorder,
  },
  btnRecord: {
    backgroundColor: "rgba(225, 29, 72, 0.20)",
    borderColor: "rgba(251, 113, 133, 0.45)",
  },
  btnResume: {
    backgroundColor: CORE_COLORS.emeraldFill,
    borderColor: CORE_COLORS.emeraldFill,
  },
  btnPause: {
    backgroundColor: CORE_COLORS.amberSoft,
    borderColor: CORE_COLORS.amberBorder,
  },
  btnStop: {
    backgroundColor: CORE_COLORS.coralSoft,
    borderColor: CORE_COLORS.coralBorder,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});
