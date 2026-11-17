import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ShieldAlert, Check, X } from "lucide-react-native";
import { PermissionRequestPayload, PermissionOption } from "../../types/agent";
import { CoreCard } from "../ui/CoreCard";
import { TactilePressable } from "../ui/TactilePressable";
import { CORE_COLORS, CORE_RADIUS } from "../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../theme/typography";

interface Props {
  permission: PermissionRequestPayload;
  onRespond: (optionId?: string) => void;
}

export const PermissionCard: React.FC<Props> = ({ permission, onRespond }) => {
  const toolCall = permission.tool_call || {};
  const toolName = toolCall.name || "Tool Request";
  const toolTitle = toolCall.title || toolName;
  const args = toolCall.args;
  const rawOptions: PermissionOption[] =
    Array.isArray(permission.options) && permission.options.length > 0
      ? permission.options
      : [
          { optionId: "deny", name: "Deny", kind: "reject_once" },
          { optionId: "allow", name: "Allow & Run", kind: "allow_once" },
        ];

  const isRejectOption = (opt: PermissionOption) => {
    const k = (opt.kind || "").toLowerCase();
    const id = (opt.optionId || "").toLowerCase();
    const name = (opt.name || "").toLowerCase();
    return (
      k.includes("reject") ||
      k.includes("deny") ||
      id.includes("deny") ||
      id.includes("reject") ||
      name.includes("deny") ||
      name.includes("reject")
    );
  };

  return (
    <CoreCard
      variant="panel"
      elevation="raised"
      accentBorderColor={CORE_COLORS.amberBorder}
      accentFillColor="rgba(245, 158, 11, 0.08)"
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.iconWell}>
          <ShieldAlert size={16} color={CORE_COLORS.amber} />
        </View>
        <Text style={styles.headerText}>Permission Required on PC</Text>
      </View>

      <Text style={styles.title}>{toolTitle}</Text>

      {args && (
        <View style={styles.argsBox}>
          <Text style={styles.argsText} numberOfLines={8}>
            {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        {rawOptions.map((opt) => {
          const reject = isRejectOption(opt);
          return (
            <View key={opt.optionId} style={styles.btnWrap}>
              <TactilePressable
                haptic
                style={[styles.btn, reject ? styles.denyBtn : styles.allowBtn]}
                onPress={() => onRespond(opt.optionId)}
              >
                {reject ? (
                  <X size={15} color={CORE_COLORS.coral} />
                ) : (
                  <Check size={15} color={CORE_COLORS.textInverse} />
                )}
                <Text
                  style={reject ? styles.denyText : styles.allowText}
                  numberOfLines={1}
                >
                  {opt.name}
                </Text>
              </TactilePressable>
            </View>
          );
        })}
      </View>
    </CoreCard>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginVertical: 8,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: CORE_COLORS.amberSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.amberBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    ...CORE_TYPOGRAPHY.eyebrow,
    color: CORE_COLORS.amber,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
  },
  argsBox: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    padding: 10,
  },
  argsText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  btnWrap: {
    flexGrow: 1,
    minWidth: "42%",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: CORE_RADIUS.md,
    borderCurve: "continuous",
    gap: 6,
  },
  denyBtn: {
    backgroundColor: CORE_COLORS.coralSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.coralBorder,
  },
  denyText: {
    color: CORE_COLORS.coral,
    fontWeight: "600",
    fontSize: 13,
  },
  allowBtn: {
    backgroundColor: CORE_COLORS.emeraldFill,
  },
  allowText: {
    color: CORE_COLORS.textInverse,
    fontWeight: "700",
    fontSize: 13,
  },
});
