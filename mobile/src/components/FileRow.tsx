import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
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
  const renderIcon = () => {
    if (item.is_dir) return <Folder size={16} color="#06B6D4" />;
    switch (item.category) {
      case "image":
        return <FileImage size={16} color="#10B981" />;
      case "video":
        return <FileVideo size={16} color="#F59E0B" />;
      case "pdf":
        return <FileText size={16} color="#EF4444" />;
      case "code":
        return <FileCode size={16} color="#06B6D4" />;
      default:
        return <File size={16} color="#94A3B8" />;
    }
  };

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.75}
      onPress={() => onPress(item)}
    >
      <View style={styles.iconBox}>{renderIcon()}</View>

      <View style={styles.infoCol}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta}>
          {item.is_dir
            ? `DIRECTORY // ${item.modified_at}`
            : `${formatBytes(item.size_bytes)} // ${item.modified_at}`}
        </Text>
      </View>

      <View style={styles.rightAction}>
        {item.is_dir ? (
          <ChevronRight size={15} color="#64748B" />
        ) : (
          <Download size={14} color="#06B6D4" />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#1E1E1E",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
  },
  meta: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
  rightAction: {
    paddingLeft: 8,
  },
});

