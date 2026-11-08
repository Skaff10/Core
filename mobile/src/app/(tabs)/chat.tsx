import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown, Send, Terminal, Globe, Trash2 } from "lucide-react-native";
import { HeaderStatus } from "../../components/HeaderStatus";
import { ChatBubble, ChatMessage } from "../../components/ChatBubble";
import { useConnectionStore, sanitizeHostAndPort } from "../../store/useConnectionStore";

interface AgentTarget {
  id: string;
  label: string;
  mode: "LOCAL CLI" | "WEB PLAYWRIGHT";
}

const AI_TARGETS: AgentTarget[] = [
  { id: "antigravity", label: "Antigravity CLI (agy)", mode: "LOCAL CLI" },
  { id: "claude-code", label: "Claude Code CLI", mode: "LOCAL CLI" },
  { id: "powershell", label: "Windows PowerShell Pipe", mode: "LOCAL CLI" },
  { id: "chatgpt", label: "ChatGPT Web Session", mode: "WEB PLAYWRIGHT" },
  { id: "gemini", label: "Gemini Web Session", mode: "WEB PLAYWRIGHT" },
  { id: "claude-web", label: "Claude Web Session", mode: "WEB PLAYWRIGHT" },
];

export default function ChatScreen() {
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const [selectedAgent, setSelectedAgent] = useState<AgentTarget>(AI_TARGETS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [wsLinked, setWsLinked] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "boot-msg",
      role: "assistant",
      agent: "antigravity",
      content:
        "CORE AI RELAY READY // Select a Local CLI Agent (stdin/stdout pipe) or Web AI target (Playwright Chromium controller) from the header selector above.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function cleanupSocket() {
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    }

    function connectChatWs() {
      if (!mounted || !pcIp || !authToken) return;
      cleanupSocket();

      const { cleanIp, cleanPort } = sanitizeHostAndPort(pcIp, pcPort);
      const url = `ws://${cleanIp}:${cleanPort}/ws/chat?token=${encodeURIComponent(
        authToken.trim()
      )}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mounted) setWsLinked(true);
      };

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "stream_start") {
            setMessages((prev) => [
              ...prev,
              {
                id: `ai-${data.id}`,
                role: "assistant",
                agent: data.agent || selectedAgent.id,
                content: "",
                timestamp: data.timestamp || new Date().toLocaleTimeString(),
                streaming: true,
              },
            ]);
          } else if (data.type === "stream_chunk") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === `ai-${data.id}`
                  ? { ...m, content: m.content + data.chunk }
                  : m
              )
            );
          } else if (data.type === "stream_end") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === `ai-${data.id}` ? { ...m, streaming: false } : m
              )
            );
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!mounted) return;
        setWsLinked(false);
        retryTimer = setTimeout(connectChatWs, 3000);
      };
    }

    connectChatWs();

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      cleanupSocket();
    };
  }, [pcIp, pcPort, authToken]);

  const handleSendPrompt = () => {
    const clean = promptInput.trim();
    if (!clean) return;

    const msgId = String(Date.now());
    const userMsg: ChatMessage = {
      id: `user-${msgId}`,
      role: "user",
      agent: selectedAgent.id,
      content: clean,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPromptInput("");

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          id: msgId,
          agent: selectedAgent.id,
          prompt: clean,
        })
      );
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${msgId}`,
          role: "assistant",
          agent: "system",
          content:
            "ERR // AI Relay WebSocket is not connected. Verify PC IP and PIN in Settings.",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="AI RELAY // VIBE CONTROL" />

      {/* TARGET AGENT SELECTOR HEADER */}
      <View style={styles.selectorBar}>
        <TouchableOpacity
          style={styles.selectorTrigger}
          activeOpacity={0.8}
          onPress={() => setDropdownOpen((v) => !v)}
        >
          <View style={styles.selectorLeft}>
            {selectedAgent.mode === "LOCAL CLI" ? (
              <Terminal size={14} color="#06B6D4" />
            ) : (
              <Globe size={14} color="#06B6D4" />
            )}
            <View>
              <Text style={styles.selectorLabel}>{selectedAgent.label}</Text>
              <Text style={styles.selectorMode}>
                {selectedAgent.mode} // {wsLinked ? "PIPE READY" : "OFFLINE"}
              </Text>
            </View>
          </View>
          <ChevronDown size={16} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => setMessages([])}
        >
          <Trash2 size={14} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* DROPDOWN MENU */}
      {dropdownOpen && (
        <View style={styles.dropdownMenu}>
          {AI_TARGETS.map((item) => {
            const active = item.id === selectedAgent.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                onPress={() => {
                  setSelectedAgent(item);
                  setDropdownOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemTitle,
                    active && { color: "#06B6D4" },
                  ]}
                >
                  {item.label}
                </Text>
                <Text style={styles.dropdownItemBadge}>{item.mode}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* MESSAGE STREAM */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* INPUT BAR */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={promptInput}
            onChangeText={setPromptInput}
            placeholder={`Transmit prompt to ${selectedAgent.label}...`}
            placeholderTextColor="#64748B"
            multiline
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSendPrompt}
            activeOpacity={0.8}
          >
            <Send size={16} color="#090D16" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  flexOne: {
    flex: 1,
  },
  selectorBar: {
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectorTrigger: {
    flex: 1,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectorLabel: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
  },
  selectorMode: {
    color: "#06B6D4",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  clearBtn: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 10,
    borderRadius: 2,
  },
  dropdownMenu: {
    backgroundColor: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#06B6D4",
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownItemActive: {
    backgroundColor: "#121A1D",
  },
  dropdownItemTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
  },
  dropdownItemBadge: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
  chatList: {
    padding: 14,
    paddingBottom: 20,
  },
  inputBar: {
    backgroundColor: "#181818",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    color: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    maxHeight: 110,
    fontFamily: "monospace",
  },
  sendBtn: {
    backgroundColor: "#06B6D4",
    width: 42,
    height: 40,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
