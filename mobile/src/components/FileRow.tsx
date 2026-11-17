import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  Folder,
  FileImage,
  FileVideo,
  FileText,
  FileCode,
  File,
  ChevronRight,
  Download,
} from "lucide-react-native";
import { RemoteFileEntry } from "../services/api";
import { TactilePressable } from "./ui/TactilePressable";
import { CORE_COLORS, CORE_RADIUS } from "../theme/tokens";
import { CORE_TYPOGRAPHY } from "../theme/typography";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const FileRow: React.FC<{
  item: RemoteFileEntry;
  onPress: (item: RemoteFileEntry) => void;
}> = ({ item, onPress }) => {
  const getVisuals = () => {
    if (item.is_dir) {
      return {
        icon: <Folder size={18} color={CORE_COLORS.cyan} />,
        bg: CORE_COLORS.cyanSoft,
        border: CORE_COLORS.cyanBorder,
      };
    }
    switch (item.category) {
      case "image":
        return {
          icon: <FileImage size={18} color={CORE_COLORS.emerald} />,
          bg: CORE_COLORS.emeraldSoft,
          border: CORE_COLORS.emeraldBorder,
        };
      case "video":
        return {
          icon: <FileVideo size={18} color={CORE_COLORS.amber} />,
          bg: CORE_COLORS.amberSoft,
          border: CORE_COLORS.amberBorder,
        };
      case "pdf":
        return {
          icon: <FileText size={18} color={CORE_COLORS.coral} />,
          bg: CORE_COLORS.coralSoft,
          border: CORE_COLORS.coralBorder,
        };
      case "code":
        return {
          icon: <FileCode size={18} color={CORE_COLORS.sky} />,
          bg: "rgba(56, 189, 248, 0.14)",
          border: "rgba(56, 189, 248, 0.34)",
        };
      default:
        return {
          icon: <File size={18} color={CORE_COLORS.textSecondary} />,
          bg: CORE_COLORS.surfaceWell,
          border: CORE_COLORS.borderSubtle,
        };
    }
  };

  const visuals = getVisuals();

  return (
    <TactilePressable
      haptic
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={item.is_dir ? `Open folder ${item.name}` : `Preview file ${item.name}`}
      style={styles.row}
    >
      <View
        style={[
          styles.iconBox,
          { backgroundColor: visuals.bg, borderColor: visuals.border },
        ]}
      >
        {visuals.icon}
      </View>

      <View style={styles.infoCol}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.is_dir
            ? `Folder · ${item.modified_at}`
            : `${formatBytes(item.size_bytes)} · ${item.modified_at}`}
        </Text>
      </View>

      <View style={styles.rightAction}>
        {item.is_dir ? (
          <ChevronRight size={17} color={CORE_COLORS.textTertiary} />
        ) : (
          <View style={styles.downloadIconWell}>
            <Download size={14} color={CORE_COLORS.cyan} />
          </View>
        )}
      </View>
    </TactilePressable>
  );
};

const styles = StyleSheet.create({
  row: {
    backgroundColor: CORE_COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.lg,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 14.5,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
  },
  meta: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  rightAction: {
    paddingLeft: 4,
  },
  downloadIconWell: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: CORE_COLORS.cyanSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
